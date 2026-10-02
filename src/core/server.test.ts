import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/server';
import { chromium } from 'playwright';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

// Mock modules before importing
const { mockServer, mockBrowser } = vi.hoisted(() => ({
  mockServer: { setRequestHandler: vi.fn(), connect: vi.fn() },
  mockBrowser: { newPage: vi.fn(), close: vi.fn() },
}));

vi.mock('@modelcontextprotocol/server', async importOriginal => ({
  ...(await importOriginal<typeof import('@modelcontextprotocol/server')>()),
  Server: vi.fn(),
}));
vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('playwright', () => ({ chromium: { launch: vi.fn() } }));

import { OLXMCPServer, type ServerConfig } from './server.js';

describe('OLXMCPServer', () => {
  let server: OLXMCPServer;
  let config: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Server).mockImplementation(() => mockServer as unknown as Server);
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as any);
    mockServer.connect.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);

    config = {
      name: 'test-olx-mcp-server',
      version: '1.0.0-test',
      headless: true,
    };

    server = new OLXMCPServer(config);
  });

  describe('Server initialization', () => {
    it('should create server with correct configuration', () => {
      expect(server).toBeInstanceOf(OLXMCPServer);
      expect(server.getServer()).toBeDefined();
    });

    it('should initialize browser and register tools', async () => {
      await server.initialize();

      expect(chromium.launch).toHaveBeenCalledWith({
        channel: 'chromium',
        headless: true,
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
    });

    it('should use headless option from config', async () => {
      const headlessConfig = { ...config, headless: false };
      const headlessServer = new OLXMCPServer(headlessConfig);

      await headlessServer.initialize();

      expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: false }));
    });

    it('should default to headless when not specified', async () => {
      const defaultConfig = { name: 'test', version: '1.0.0' };
      const defaultServer = new OLXMCPServer(defaultConfig);

      await defaultServer.initialize();

      expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
    });
  });

  describe('Connection management', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('should connect to transport', async () => {
      const mockTransport = { send: vi.fn(), onMessage: vi.fn() };

      server.serve(mockTransport as any);

      const serverInstance = server.getServer();
      expect(serverInstance).toBeDefined();
      expect(serveStdio).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ legacy: 'reject', transport: mockTransport })
      );
    });
  });

  describe('Modern serving lifecycle', () => {
    it('prepares resources only when the modern entry invokes its factory', async () => {
      const prepare = vi.fn(() => server.initialize());
      server.serve(undefined, prepare);
      expect(prepare).not.toHaveBeenCalled();
      expect(chromium.launch).not.toHaveBeenCalled();
      const factory = vi.mocked(serveStdio).mock.calls[0]![0];
      expect(await factory({ era: 'modern' } as any)).toBe(server.getServer());
      expect(prepare).toHaveBeenCalledOnce();
      await server.cleanup();
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    });
    it('cleans up resources if factory preparation fails', async () => {
      await server.initialize();
      server.serve(undefined, async () => {
        throw new Error('Preparation failed');
      });
      const factory = vi.mocked(serveStdio).mock.calls[0]![0];
      await expect(factory({ era: 'modern' } as any)).rejects.toThrow('Preparation failed');
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    });
  });

  describe('Resource cleanup', () => {
    it('should clean up browser resources', async () => {
      await server.initialize();

      await server.cleanup();

      // Get the mock browser that was created
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    });

    it('should handle cleanup when browser is not initialized', async () => {
      // Should not throw error
      await expect(server.cleanup()).resolves.toBeUndefined();
    });

    it('should surface browser cleanup errors', async () => {
      await server.initialize();

      mockBrowser.close.mockRejectedValueOnce(new Error('Close failed'));
      await expect(server.cleanup()).rejects.toThrow('Close failed');
    });
  });

  describe('Error handling', () => {
    it('should handle browser launch failures', async () => {
      vi.mocked(chromium.launch).mockRejectedValueOnce(new Error('Browser launch failed'));

      await expect(server.initialize()).rejects.toThrow('Browser launch failed');
    });

    it('should propagate transport connection failures', async () => {
      vi.mocked(serveStdio).mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });
      expect(() => server.serve()).toThrow('Connection failed');
    });
  });

  describe('Server configuration', () => {
    it('should use provided server name and version', () => {
      const customConfig: ServerConfig = {
        name: 'custom-olx-server',
        version: '2.1.0',
        headless: false,
      };

      const customServer = new OLXMCPServer(customConfig);

      expect(customServer).toBeInstanceOf(OLXMCPServer);
    });

    it('should handle minimal configuration', () => {
      const minimalConfig: ServerConfig = {
        name: 'minimal-server',
        version: '1.0.0',
      };

      const minimalServer = new OLXMCPServer(minimalConfig);
      expect(minimalServer).toBeInstanceOf(OLXMCPServer);
    });
  });

  describe('Browser configuration', () => {
    it('should configure browser with security options', async () => {
      await server.initialize();

      expect(chromium.launch).toHaveBeenCalledWith({
        channel: 'chromium',
        headless: true,
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ]),
      });
    });

    it('should pass through headless configuration', async () => {
      const configs = [
        { name: 'test', version: '1.0.0', headless: true },
        { name: 'test', version: '1.0.0', headless: false },
        { name: 'test', version: '1.0.0' }, // undefined should default to true
      ];

      for (const testConfig of configs) {
        vi.clearAllMocks();

        const testServer = new OLXMCPServer(testConfig);
        await testServer.initialize();

        const expectedHeadless = testConfig.headless ?? true;
        expect(chromium.launch).toHaveBeenCalledWith(
          expect.objectContaining({ headless: expectedHeadless })
        );
      }
    });
  });

  describe('Performance considerations', () => {
    it('should initialize efficiently', async () => {
      const startTime = Date.now();
      await server.initialize();
      const endTime = Date.now();

      // Should complete quickly (within reasonable time for tests)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid cleanup and re-initialization', async () => {
      for (let i = 0; i < 3; i++) {
        await server.initialize();
        await server.cleanup();
      }

      expect(chromium.launch).toHaveBeenCalledTimes(3);
    });
  });
  describe('MCP request handlers', () => {
    const getHandler = (schema: unknown) => {
      const call = mockServer.setRequestHandler.mock.calls.find(
        ([registered]) => registered === schema
      );
      expect(call).toBeDefined();
      return (request?: unknown, context = { mcpReq: { signal: new AbortController().signal } }) =>
        call![1](request, context);
    };

    it('lists all four tools after initialization with their JSON schemas', async () => {
      await server.initialize();
      const result = await getHandler('tools/list')();
      expect(result.tools.map((tool: any) => tool.name)).toEqual([
        'searchListings',
        'getListingDetails',
        'getListingImages',
        'searchLocations',
      ]);
      expect(result.tools.every((tool: any) => tool.inputSchema.type === 'object')).toBe(true);
    });

    it('rejects an unknown tool', async () => {
      await expect(getHandler('tools/call')({ params: { name: 'missing' } })).rejects.toThrow(
        'Tool not found: missing'
      );
    });

    it('surfaces tool argument validation errors', async () => {
      await server.initialize();
      const result = await getHandler('tools/call')({ params: { name: 'searchListings' } });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });

    it('serializes successful tool data into MCP text content', async () => {
      await server.initialize();
      const data = {
        listings: [],
        totalCount: 0,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
      };
      const registry = (server as any).registry;
      vi.spyOn(registry.get('searchListings'), 'execute').mockResolvedValue({
        success: true,
        data,
      });
      const result = await getHandler('tools/call')({
        params: { name: 'searchListings', arguments: { domain: 'olx.in', query: 'test' } },
      });
      expect(result.structuredContent).toEqual(data);
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(data) }]);
    });

    it('preserves native image blocks from a photo tool result', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      vi.spyOn(registry.get('getListingImages'), 'execute').mockResolvedValue({
        success: true,
        data: {
          listingId: '123',
          title: 'Fixture',
          listingUrl: 'https://www.olx.in/item/123',
          warnings: [],
          images: [
            {
              url: 'https://apollo.olx.in/a.jpg',
              data: '/9j/',
              mimeType: 'image/jpeg',
              byteLength: 3,
            },
          ],
        },
      });
      const result = await getHandler('tools/call')({
        params: { name: 'getListingImages', arguments: { domain: 'olx.in', listingId: '123' } },
      });
      expect(result.content[1]).toEqual({ type: 'image', data: '/9j/', mimeType: 'image/jpeg' });
      expect(JSON.parse(result.content[0].text).images[0]).not.toHaveProperty('data');
    });

    it('validates wire output and serializes dates as ISO strings', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      const execute = vi.spyOn(registry.get('getListingDetails'), 'execute');
      execute.mockResolvedValueOnce({
        success: true,
        data: {
          id: '123',
          title: 'Fixture',
          url: 'https://www.olx.in/item/123',
          publishedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const response = await getHandler('tools/call')({
        params: { name: 'getListingDetails', arguments: {} },
      });
      expect(response.structuredContent.publishedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(JSON.parse(response.content[0].text)).toEqual(response.structuredContent);
      execute.mockResolvedValueOnce({ success: true, data: { title: 'Missing required fields' } });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const invalid = await getHandler('tools/call')({
        params: { name: 'getListingDetails', arguments: {} },
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0].text).toBe('Tool produced an invalid result');
      log.mockRestore();
    });
    it('forwards the SDK v2 request cancellation signal', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      const execute = vi
        .spyOn(registry.get('searchListings'), 'execute')
        .mockResolvedValue({ success: false, error: new Error('cancelled') });
      const signal = new AbortController().signal;
      await getHandler('tools/call')(
        { params: { name: 'searchListings', arguments: { query: 'x' } } },
        { mcpReq: { signal } }
      );
      expect(execute).toHaveBeenCalledWith({ query: 'x' }, signal);
    });
    it.each([true, false])('logs only safe request metadata when success is %s', async success => {
      await server.initialize();
      const privateValue = 'PRIVATE_QUERY_OR_LISTING';
      const registry = (server as any).registry;
      vi.spyOn(registry.get('searchListings'), 'execute').mockResolvedValue(
        success
          ? {
              success: true,
              data: {
                listings: [{ id: '123', title: privateValue, url: 'https://www.olx.in/item/123' }],
                totalCount: 1,
                currentPage: 1,
                totalPages: 1,
                hasNextPage: false,
              },
            }
          : { success: false, error: new Error(privateValue) }
      );
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await getHandler('tools/call')({
          params: {
            name: 'searchListings',
            arguments: { domain: 'olx.in', query: privateValue },
          },
        });
        expect(log).toHaveBeenCalledOnce();
        const summary = JSON.parse(log.mock.calls[0]![0]);
        expect(summary).toEqual({
          event: 'mcp_tool',
          tool: 'searchListings',
          domain: 'olx.in',
          status: success ? 'success' : 'error',
          elapsedMs: expect.any(Number),
          ...(success ? { resultCount: 1 } : { errorKind: 'tool_error' }),
        });
        expect(summary.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(log.mock.calls[0]![0]).not.toContain(privateValue);
      } finally {
        log.mockRestore();
      }
    });

    it('logs unexpected failures without retaining unrecognized domain arguments', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      vi.spyOn(registry.get('searchListings'), 'execute').mockRejectedValue(
        new Error('PRIVATE_ERROR')
      );
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(
          getHandler('tools/call')({
            params: {
              name: 'searchListings',
              arguments: { domain: 'PRIVATE_DOMAIN', query: 'PRIVATE_QUERY' },
            },
          })
        ).rejects.toThrow('PRIVATE_ERROR');
        expect(log).toHaveBeenCalledOnce();
        expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
          event: 'mcp_tool',
          tool: 'searchListings',
          status: 'error',
          elapsedMs: expect.any(Number),
          errorKind: 'exception',
        });
        expect(log.mock.calls[0]![0]).not.toContain('PRIVATE');
      } finally {
        log.mockRestore();
      }
    });

    it('surfaces scraper failures returned by a tool', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      vi.spyOn(registry.get('searchListings'), 'execute').mockResolvedValue({
        success: false,
        error: new Error('Scraping failed'),
      });
      const result = await getHandler('tools/call')({
        params: { name: 'searchListings', arguments: {} },
      });
      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Scraping failed' }],
      });
    });
  });
});
