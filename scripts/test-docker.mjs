import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const image = process.argv[2] || 'olx-mcp:local';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const runtimeArgs = [
  'run',
  '--rm',
  '--network=none',
  '--read-only',
  '--tmpfs=/tmp:rw,nosuid,size=256m',
];

const browserCheck = spawnSync(
  'docker',
  [
    ...runtimeArgs,
    '--entrypoint=node',
    image,
    '--input-type=module',
    '-e',
    `
      import assert from 'node:assert/strict';
      import { existsSync } from 'node:fs';
      import { chromium } from 'playwright';
      assert.notEqual(process.getuid(), 0, 'Container must run as a non-root user');
      assert.equal(existsSync('/app/node_modules/typescript'), false, 'Development dependencies must be absent');
      assert.equal(existsSync('/app/src'), false, 'Source files must be absent');
      assert.equal(existsSync('/app/dist/scrapers/olx/olx-brazil.scraper.js'), false, 'Removed adapter must be absent');
      const browser = await chromium.launch({ channel: 'chromium', headless: true });
      try {
        const page = await browser.newPage();
        // Exercise the compiled scraper against an SSR page whose scripts remove its cards.
        // A JavaScript-enabled search would lose these cards and falsely return no results.
        const { OlxScraperFactory } = await import('./dist/scrapers/olx/scraper.factory.js');
        const fixture = '<div data-cy="l-card"><a href="/d/anuncio/fixture-IDfixture.html"><div data-testid="ad-card-title"><h4>Fixture listing</h4></div><span data-testid="ad-price">10 EUR</span></a></div><span data-testid="total-count">1</span><script>document.querySelector("[data-cy=l-card]").remove();throw new Error("ChunkLoadError");</script>';
        const fixtureBrowser = { newPage: async options => {
          const fixturePage = await browser.newPage(options);
          await fixturePage.route(new RegExp('^https://www[.]olx[.](pt|pl|bg|ro|ua|kz|uz)/'), route => route.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
          return fixturePage;
        } };
        for (const domain of ['olx.pt', 'olx.pl', 'olx.bg', 'olx.ro', 'olx.ua', 'olx.kz', 'olx.uz']) {
          const result = await new OlxScraperFactory(fixtureBrowser).getScraper(domain).scrape({ domain, query: 'fixture', limit: 1 });
          assert.equal(result.success, true, 'SSR fixture search must succeed');
          assert.equal(result.data.listings[0]?.title, 'Fixture listing', 'SSR cards must survive page scripts');
        }
        const polishDetail = '<div data-testid="offer_title"><h4>Polish fixture title</h4><button>Watch</button></div><div data-testid="ad-price-container">10 PLN</div><div data-testid="ad_description">Fixture description</div><script>document.querySelector("[data-testid=offer_title]").remove();</script>';
        const polishBrowser = { newPage: async options => {
          const fixturePage = await browser.newPage(options);
          await fixturePage.route(new RegExp('^https://www[.]olx[.]pl/'), route => route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().includes('/d/anuncio/') ? polishDetail : fixture.split('<script>')[0] }));
          return fixturePage;
        } };
        const polishScraper = new OlxScraperFactory(polishBrowser).getScraper('olx.pl');
        const polishSearch = await polishScraper.scrape({ domain: 'olx.pl', query: 'fixture', limit: 1 });
        assert.equal(polishSearch.success, true);
        const polishResult = await polishScraper.getListingDetails(polishSearch.data.listings[0].id);
        assert.equal(polishResult.success, true, 'Polish SSR details must survive frontend scripts');
        assert.equal(polishResult.data.title, 'Polish fixture title', 'Action button text must not enter the title');
        // Exercise native image delivery over the actual SDK transport without external downloads.
        const { OLXMCPServer } = await import('./dist/core/server.js');
        const { GetListingImagesTool } = await import('./dist/tools/listing/get-listing-images.tool.js');
        const { createMcpHandler } = await import('@modelcontextprotocol/server');
        const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
        const fixturePhoto = { url: 'https://apollo.olx.in/fixture.png', mimeType: 'image/png', data: photo.toString('base64'), byteLength: photo.length };
        const photoTool = new GetListingImagesTool({ getScraper: () => ({ getListingDetails: async () => ({ success: true, data: { id: 'fixture', title: 'Photo fixture', url: 'https://www.olx.in/item/fixture', images: [fixturePhoto.url] } }) }) }, { download: async () => fixturePhoto });
        const photoServer = new OLXMCPServer({ name: 'photo-fixture', version: '1' });
        photoServer.registry.register(photoTool);
        const handler = createMcpHandler(() => photoServer.getServer(), { legacy: 'reject' });
        try {
          const response = await handler.fetch(new Request('http://fixture/mcp', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'getListingImages' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'getListingImages', arguments: { domain: 'olx.in', listingId: 'fixture' }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
          }));
          assert.equal(response.status, 200);
          const { result, error } = await response.json();
          assert.equal(error, undefined);
          assert.equal(result.resultType, 'complete');
          assert.equal(result.content[1].type, 'image');
          assert.equal(result.content[1].mimeType, 'image/png');
          assert.deepEqual(Buffer.from(result.content[1].data, 'base64'), photo);
          const metadata = result.structuredContent;
          assert.deepEqual(JSON.parse(result.content[0].text), metadata);
          assert.equal(metadata.images[0].url, fixturePhoto.url);
          assert.equal(metadata.images[0].byteLength, photo.length);
          assert.equal(metadata.images[0].data, undefined, 'Base64 must not be duplicated in metadata');
        } finally {
          await handler.close();
        }
        await page.setContent(fixture);
        assert.equal(await page.locator('[data-cy="l-card"]').count(), 0, 'Fixture must reproduce card loss when JavaScript is enabled');
        const { getDomainConfig } = await import('./dist/scrapers/olx/domain-config.js');
        const { extractGalleryImages } = await import('./dist/scrapers/olx/dom-extractors.js');
        await page.setContent('<img src="https://statics.olx.co.id/logo.png"><img data-aut-id="defaultImg" src="https://apollo.olx.co.id/photo.jpg"><div data-aut-id="defaultImg"><img src="data:image/gif;base64,placeholder" data-src="https://apollo.olx.co.id/lazy.jpg"></div>', { waitUntil: 'domcontentloaded' });
        const indonesiaPhotos = await page.$$eval(getDomainConfig('olx.co.id').selectors.detail.images, extractGalleryImages);
        assert.deepEqual(indonesiaPhotos, ['https://apollo.olx.co.id/photo.jpg', 'https://apollo.olx.co.id/lazy.jpg'], 'Gallery selection must exclude logos and preserve lazy photo URLs');
        await page.setContent('<title>OLX MCP container check</title>');
        assert.equal(await page.title(), 'OLX MCP container check');
      } finally {
        await browser.close();
      }
    `,
  ],
  { stdio: 'inherit', timeout: 60000 }
);
if (browserCheck.error) throw browserCheck.error;
assert.equal(browserCheck.status, 0, 'Container browser check failed');

// The actual CLI must reject a legacy opening and exit when stdin closes,
// without launching a browser for a client it will never serve.
const legacy = spawnSync('docker', [...runtimeArgs, '-i', image], {
  input:
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'legacy-check', version: '1' },
      },
    }) + '\n',
  encoding: 'utf8',
  timeout: 15000,
});
if (legacy.error) throw legacy.error;
assert.equal(legacy.status, 0, 'Legacy-rejected process must exit on stdin EOF');
const rejection = JSON.parse(legacy.stdout.trim());
assert.equal(rejection.error.code, -32022);
assert.deepEqual(rejection.error.data.supported, ['2026-07-28']);

const client = new Client(
  { name: 'olx-mcp-docker-check', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } }
);
const transport = new StdioClientTransport({
  command: 'docker',
  args: [...runtimeArgs, '-i', image],
  stderr: 'inherit',
});

const deadline = setTimeout(() => {
  console.error('Container MCP check timed out');
  client.close().finally(() => process.exit(1));
}, 30000);

try {
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.version, version);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'getListingDetails',
    'getListingImages',
    'searchListings',
    'searchLocations',
  ]);
  assert.equal(client.getProtocolEra(), 'modern');
  assert.deepEqual(client.getDiscoverResult().supportedVersions, ['2026-07-28']);
  assert(
    tools.every(tool => tool.outputSchema),
    'All tools must advertise output schemas'
  );
  for (const name of [
    'searchListings',
    'searchLocations',
    'getListingDetails',
    'getListingImages',
  ]) {
    const result = await client.callTool({
      name,
      arguments: { domain: 'olx.com.br', query: 'test', listingId: '123' },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Validation error/);
  }
  await assert.rejects(client.callTool({ name: 'missing', arguments: {} }), /Tool not found/);
  console.log(
    'Docker checks passed: non-root runtime, Chromium, MCP 2026-07-28 discovery, native images, output schemas, and tool errors'
  );
} finally {
  clearTimeout(deadline);
  await client.close();
}
