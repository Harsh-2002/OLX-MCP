import { describe, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const fixture = `
import { OLXMCPServer } from './src/core/server.ts';
import { SearchListingsTool } from './src/tools/search/search-listings.tool.ts';
import { GetListingImagesTool } from './src/tools/listing/get-listing-images.tool.ts';
const server = new OLXMCPServer({ name: 'protocol-fixture', version: '1' });
const photo = { url: 'https://apollo.olx.in/a.png', mimeType: 'image/png', data: 'iVBORw0KGgo=', byteLength: 8 };
const search = new SearchListingsTool({ getScraper: () => ({ scrape: async (args, signal) => {
  if (args.query === 'cancel') {
    console.error('fixture-started');
    await new Promise(resolve => signal.addEventListener('abort', () => { console.error('fixture-cancelled'); resolve(); }, { once: true }));
    return { success: false, error: new Error('cancelled') };
  }
  return { success: true, data: { listings: [], totalCount: 0, currentPage: 1, totalPages: 1, hasNextPage: false } };
} }) });
const images = new GetListingImagesTool({ getScraper: () => ({ getListingDetails: async () => ({ success: true, data: { title: 'Photo fixture', url: 'https://www.olx.in/item/123', images: [photo.url] } }) }) }, { download: async () => photo });
server.registry.register(search).register(images);
server.serve();
`;
const args = ['--import', 'tsx', '--input-type=module', '-e', fixture];
async function connect() {
  const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe' });
  const client = new Client(
    { name: 'modern-test', version: '1' },
    {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    }
  );
  await client.connect(transport);
  return { client, transport };
}

describe('MCP 2026-07-28 over real stdio', () => {
  it('discovers modern-only support and validates structured search and photo results', async () => {
    const { client } = await connect();
    try {
      expect(client.getProtocolEra()).toBe('modern');
      expect(client.getDiscoverResult()?.supportedVersions).toEqual(['2026-07-28']);
      const { tools } = await client.listTools();
      expect(tools.every(tool => tool.outputSchema && tool.inputSchema)).toBe(true);
      const search = await client.callTool({
        name: 'searchListings',
        arguments: { domain: 'olx.in', query: 'test' },
      });
      expect(search.structuredContent).toEqual({
        listings: [],
        totalCount: 0,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
      });
      const photo = await client.callTool({
        name: 'getListingImages',
        arguments: { domain: 'olx.in', listingId: '123' },
      });
      expect(photo.isError).not.toBe(true);
      expect(photo.content[1]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        data: 'iVBORw0KGgo=',
      });
      expect(photo.structuredContent).toEqual(
        JSON.parse((photo.content[0] as { text: string }).text)
      );
      expect(JSON.stringify(photo.structuredContent)).not.toContain('iVBOR');
    } finally {
      await client.close();
    }
  });

  it('distinguishes tool execution errors from unknown-tool protocol errors', async () => {
    const { client } = await connect();
    try {
      const invalid = await client.callTool({
        name: 'searchListings',
        arguments: { domain: 'invalid', query: 'test' },
      });
      expect(invalid.isError).toBe(true);
      expect((invalid.content[0] as { text: string }).text).toContain('Validation error');
      await expect(client.callTool({ name: 'missing', arguments: {} })).rejects.toMatchObject({
        code: -32602,
      });
    } finally {
      await client.close();
    }
  });

  it('delivers client cancellation to the active tool', async () => {
    const { client, transport } = await connect();
    try {
      await client.callTool({
        name: 'searchListings',
        arguments: { domain: 'olx.in', query: 'warmup' },
      });
      let stderr = '';
      transport.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });
      const controller = new AbortController();
      const pending = client.callTool(
        { name: 'searchListings', arguments: { domain: 'olx.in', query: 'cancel' } },
        { signal: controller.signal }
      );
      void pending.catch(() => {});
      await vi.waitFor(() => expect(stderr).toContain('fixture-started'), { timeout: 15000 });
      controller.abort();
      await expect(pending).rejects.toBeDefined();
      await vi.waitFor(() => expect(stderr).toContain('fixture-cancelled'), { timeout: 5000 });
    } finally {
      await client.close();
    }
  });

  it('rejects a legacy initialize request on the wire', async () => {
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: child.stdout });
    try {
      const reply = once(lines, 'line');
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'old-client', version: '1' },
          },
        }) + '\n'
      );
      const [line] = await reply;
      const result = JSON.parse(line);
      expect(result.error.code).toBe(-32022);
      expect(result.error.data.supported).toEqual(['2026-07-28']);
    } finally {
      lines.close();
      child.stdin.end();
      await once(child, 'exit');
    }
  });
});
