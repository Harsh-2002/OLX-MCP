import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
      const browser = await chromium.launch({ channel: 'chromium', headless: true });
      try {
        const page = await browser.newPage();
        // Exercise the compiled scraper against an SSR page whose scripts remove its cards.
        // A JavaScript-enabled search would lose these cards and falsely return no results.
        const { OlxScraperFactory } = await import('./dist/scrapers/olx/scraper.factory.js');
        const fixture = '<div data-cy="l-card"><a href="/d/anuncio/fixture-IDfixture.html"><div data-testid="ad-card-title"><h4>Fixture listing</h4></div><span data-testid="ad-price">10 EUR</span></a></div><span data-testid="total-count">1</span><script>document.querySelector("[data-cy=l-card]").remove();throw new Error("ChunkLoadError");</script>';
        const fixtureBrowser = { newPage: async options => {
          const fixturePage = await browser.newPage(options);
          await fixturePage.route(new RegExp('^https://www[.]olx[.](pt|uz)/'), route => route.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
          return fixturePage;
        } };
        for (const domain of ['olx.pt', 'olx.uz']) {
          const result = await new OlxScraperFactory(fixtureBrowser).getScraper(domain).scrape({ domain, query: 'fixture', limit: 1 });
          assert.equal(result.success, true, 'SSR fixture search must succeed');
          assert.equal(result.data.listings[0]?.title, 'Fixture listing', 'SSR cards must survive page scripts');
        }
        await page.setContent(fixture);
        assert.equal(await page.locator('[data-cy="l-card"]').count(), 0, 'Fixture must reproduce card loss when JavaScript is enabled');
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

const client = new Client({ name: 'olx-mcp-docker-check', version: '1.0.0' });
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
    'searchListings',
    'searchLocations',
  ]);
  await assert.rejects(
    client.callTool({ name: 'searchListings', arguments: { domain: 'invalid', query: 'test' } }),
    /Validation error/
  );
  console.log(
    'Docker checks passed: non-root runtime, Chromium, MCP handshake, tools, and validation'
  );
} finally {
  clearTimeout(deadline);
  await client.close();
}
