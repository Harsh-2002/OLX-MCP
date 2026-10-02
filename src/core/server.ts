import {
  Server,
  ProtocolError,
  ProtocolErrorCode,
  type Transport,
  type Tool,
} from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { MCP_PROTOCOL_VERSION, toolOutputSchemas } from './tool-output.js';
import { OLX_DOMAINS } from './domains.js';
import { chromium, Browser } from 'playwright';

import { ToolRegistry } from './tool-registry.js';
import { SearchListingsTool } from '../tools/search/search-listings.tool.js';
import { GetListingImagesTool } from '../tools/listing/get-listing-images.tool.js';
import { GetListingDetailsTool } from '../tools/listing/get-listing-details.tool.js';
import { LocationService } from '../locations/location-service.js';
import { OlxLocationProvider } from '../locations/native-location-provider.js';
import { BrowserLocationProvider } from '../locations/browser-location-provider.js';
import { SearchLocationsTool } from '../tools/locations/search-locations.tool.js';
import { OlxScraperFactory } from '../scrapers/olx/scraper.factory.js';

export interface ServerConfig {
  readonly name: string;
  readonly version: string;
  readonly headless?: boolean;
}

export class OLXMCPServer {
  private readonly registry = new ToolRegistry();
  private readonly server: Server;
  private serving?: StdioServerHandle;
  private browser?: Browser | undefined;
  private scraperFactory?: OlxScraperFactory | undefined;
  private locationService?: LocationService;

  constructor(private readonly config: ServerConfig) {
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
        cacheHints: {
          'tools/list': { ttlMs: 300000, cacheScope: 'public' },
          'server/discover': { ttlMs: 300000, cacheScope: 'public' },
        },
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async initialize(): Promise<void> {
    // Initialize browser
    this.browser = await chromium.launch({
      channel: 'chromium',
      headless: this.config.headless ?? true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    // Create scraper factory
    this.scraperFactory = new OlxScraperFactory(this.browser);

    this.locationService = new LocationService(
      new OlxLocationProvider(new BrowserLocationProvider(this.browser))
    );

    // Register tools
    this.registry
      .register(new SearchListingsTool(this.scraperFactory, this.locationService))
      .register(new GetListingDetailsTool(this.scraperFactory))
      .register(new GetListingImagesTool(this.scraperFactory))
      .register(new SearchLocationsTool(this.locationService));
  }

  private setupHandlers(): void {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: this.registry.getAllTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Tool['inputSchema'],
        outputSchema: z.toJSONSchema(toolOutputSchemas[tool.name]!, { io: 'output' }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      })),
    }));

    this.server.setRequestHandler('tools/call', async (request, extra) => {
      const { name, arguments: args } = request.params;

      const tool = this.registry.get(name);
      if (!tool) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool not found: ${name}`);
      }

      const started = performance.now();
      let status = 'error';
      let errorKind = 'exception';
      let resultCount: number | undefined;
      try {
        const result = await tool.execute(args || {}, extra.mcpReq.signal);

        if (!result.success) {
          errorKind = 'tool_error';
          return { isError: true, content: [{ type: 'text', text: result.error.message }] };
        }

        const response = tool.toMcpResult?.(result.data);
        // Serialize once to normalize Dates and omit undefined fields before validation.
        const wireData = response?.structuredContent ?? JSON.parse(JSON.stringify(result.data));
        const validated = toolOutputSchemas[name]!.safeParse(wireData);
        if (!validated.success) {
          errorKind = 'invalid_output';
          return {
            isError: true,
            content: [{ type: 'text', text: 'Tool produced an invalid result' }],
          };
        }
        status = 'success';
        const data = validated.data;
        const records =
          data['listings'] ??
          data['locations'] ??
          (name === 'getListingImages' ? data['images'] : undefined);
        resultCount = Array.isArray(records) ? records.length : 1;
        return {
          structuredContent: validated.data,
          content: response?.content ?? [
            { type: 'text' as const, text: JSON.stringify(validated.data) },
          ],
        };
      } finally {
        // Log only fixed operation metadata, never arguments, listing data or image bytes.
        const domain = OLX_DOMAINS.find(domain => domain === args?.['domain']);
        console.error(
          JSON.stringify({
            event: 'mcp_tool',
            tool: tool.name,
            domain,
            status,
            elapsedMs: Math.round(performance.now() - started),
            resultCount,
            ...(status === 'error' ? { errorKind } : {}),
          })
        );
      }
    });
  }

  getServer(): Server {
    return this.server;
  }

  async cleanup(): Promise<void> {
    const serving = this.serving;
    this.serving = undefined;
    this.server.onclose = undefined;
    await serving?.close();
    this.registry.clear();
    this.locationService?.clear();
    this.locationService = undefined;
    if (this.scraperFactory) {
      this.scraperFactory.clearCache();
      this.scraperFactory = undefined as OlxScraperFactory | undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined as Browser | undefined;
    }
  }

  serve(transport?: Transport, prepare?: () => Promise<void>): void {
    this.server.onclose = () => {
      void this.cleanup().catch(error => console.error('Cleanup failed:', error));
    };
    this.serving = serveStdio(
      async () => {
        try {
          await prepare?.();
          return this.server;
        } catch (error) {
          await this.cleanup();
          throw error;
        }
      },
      {
        legacy: 'reject',
        ...(transport ? { transport } : {}),
        onerror: error => console.error('MCP transport error:', error),
      }
    );
  }
}
