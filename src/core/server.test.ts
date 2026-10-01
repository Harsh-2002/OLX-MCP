import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { chromium } from 'playwright';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Mock modules before importing
const { mockServer, mockBrowser } = vi.hoisted(() => ({
  mockServer: { setRequestHandler: vi.fn(), connect: vi.fn() },
  mockBrowser: { newPage: vi.fn(), close: vi.fn() },
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: Symbol('ListToolsRequestSchema'),
  CallToolRequestSchema: Symbol('CallToolRequestSchema'),
}));

vi.mock('zod-to-json-schema', () => ({
  zodToJsonSchema: vi.fn().mockReturnValue({ type: 'object' }),
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
    vi.mocked(zodToJsonSchema).mockReturnValue({ type: 'object' });
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

      await server.connect(mockTransport);

      const serverInstance = server.getServer();
      expect(serverInstance.connect).toHaveBeenCalledWith(mockTransport);
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
      mockServer.connect.mockRejectedValueOnce(new Error('Connection failed'));
      await expect(server.connect({})).rejects.toThrow('Connection failed');
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
      return call![1];
    };

    it('lists all three tools after initialization with their JSON schemas', async () => {
      await server.initialize();
      const result = await getHandler(ListToolsRequestSchema)();
      expect(result.tools.map((tool: any) => tool.name)).toEqual([
        'searchListings',
        'getListingDetails',
        'searchLocations',
      ]);
      expect(result.tools.every((tool: any) => tool.inputSchema.type === 'object')).toBe(true);
    });

    it('rejects an unknown tool', async () => {
      await expect(
        getHandler(CallToolRequestSchema)({ params: { name: 'missing' } })
      ).rejects.toThrow('Tool not found: missing');
    });

    it('surfaces tool argument validation errors', async () => {
      await server.initialize();
      await expect(
        getHandler(CallToolRequestSchema)({ params: { name: 'searchListings' } })
      ).rejects.toThrow('Validation error');
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
      const result = await getHandler(CallToolRequestSchema)({
        params: { name: 'searchListings', arguments: { domain: 'olx.in', query: 'test' } },
      });
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(data, null, 2) }]);
    });

    it('surfaces scraper failures returned by a tool', async () => {
      await server.initialize();
      const registry = (server as any).registry;
      vi.spyOn(registry.get('searchListings'), 'execute').mockResolvedValue({
        success: false,
        error: new Error('Scraping failed'),
      });
      await expect(
        getHandler(CallToolRequestSchema)({ params: { name: 'searchListings', arguments: {} } })
      ).rejects.toThrow('Scraping failed');
    });
  });
});
