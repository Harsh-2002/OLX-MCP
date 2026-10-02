import { spawnSync } from 'node:child_process';

const image = process.argv[2] ?? 'olx-mcp:local';

// Self-contained because this function is serialized into the container's Node process.
async function benchmark() {
  const { default: assert } = await import('node:assert/strict');
  const { default: http } = await import('node:http');
  const { chromium } = await import('playwright');
  const { performance } = await import('node:perf_hooks');
  const { withBrowserPage } = await import('/app/dist/core/browser-pages.js');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
    'base64'
  );
  const photo = Buffer.concat([png, Buffer.alloc(512 * 1024)]);
  let assetBytes = 0;
  let assetRequests = 0;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/photo')) {
      assetBytes += photo.length;
      assetRequests++;
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': photo.length });
      res.end(photo);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<title>Fixture</title><h1>Same listing</h1><img src="/photo1.png"><img src="/photo2.png">'
      );
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    const read = async page => {
      await page.goto(url, { waitUntil: 'load' });
      return page.$$eval('img', images => images.map(image => image.getAttribute('src')));
    };
    const baselineStart = performance.now();
    const baseline = await browser.newPage({ javaScriptEnabled: false });
    const beforeUrls = await read(baseline);
    const before = {
      assetBytes,
      assetRequests,
      elapsedMs: Math.round(performance.now() - baselineStart),
    };
    await baseline.close();
    assetBytes = 0;
    assetRequests = 0;
    const filteredStart = performance.now();
    const afterUrls = await withBrowserPage(browser, { javaScriptEnabled: false }, read);
    const after = {
      assetBytes,
      assetRequests,
      elapsedMs: Math.round(performance.now() - filteredStart),
    };
    assert.deepEqual(afterUrls, beforeUrls);
    assert(before.assetBytes > 0);
    assert.equal(after.assetBytes, 0);
    console.log(
      JSON.stringify({
        fixture: 'two 512 KiB image responses',
        before,
        after,
        preservedPhotoUrls: afterUrls.length,
      })
    );
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--network=none',
    '--read-only',
    '--tmpfs=/tmp:rw,nosuid,size=256m',
    '--entrypoint=node',
    image,
    '--input-type=module',
    '-e',
    `await (${benchmark.toString()})();`,
  ],
  { stdio: 'inherit', timeout: 60000 }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
