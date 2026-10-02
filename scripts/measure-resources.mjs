import { spawnSync } from 'node:child_process';

const image = process.argv[2] ?? 'olx-mcp:local';
const rounds = Number(process.argv[3] ?? 10);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50)
  throw new Error('Rounds must be an integer from 1 to 50');

// Self-contained because this function is serialized into the container's Node process.
async function benchmark(rounds) {
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
    const run = async filtered => {
      assetBytes = 0;
      assetRequests = 0;
      const start = performance.now();
      let urls;
      if (filtered) urls = await withBrowserPage(browser, { javaScriptEnabled: false }, read);
      else {
        const page = await browser.newPage({ javaScriptEnabled: false });
        try {
          urls = await read(page);
        } finally {
          await page.close();
        }
      }
      return { assetBytes, assetRequests, elapsedMs: performance.now() - start, urls };
    };
    const measurements = [];
    for (let round = 0; round <= rounds; round++) {
      const pair = {};
      for (const filtered of round % 2 ? [true, false] : [false, true]) {
        pair[filtered ? 'after' : 'before'] = await run(filtered);
      }
      assert.deepEqual(pair.after.urls, pair.before.urls);
      assert.equal(pair.before.assetRequests, 2);
      assert.equal(pair.before.assetBytes, 2 * photo.length);
      assert.equal(pair.after.assetBytes, 0);
      assert.equal(pair.after.assetRequests, 0);
      if (round > 0) measurements.push(pair);
    }
    const summarize = name => {
      const times = measurements.map(pair => pair[name].elapsedMs).sort((a, b) => a - b);
      const median =
        times.length % 2
          ? times[Math.floor(times.length / 2)]
          : (times[times.length / 2 - 1] + times[times.length / 2]) / 2;
      return {
        assetBytes: measurements[0][name].assetBytes,
        assetRequests: measurements[0][name].assetRequests,
        elapsedMs: Number(median.toFixed(3)),
        p95ElapsedMs: Number(times[Math.ceil(times.length * 0.95) - 1].toFixed(3)),
        minElapsedMs: Number(times[0].toFixed(3)),
        maxElapsedMs: Number(times.at(-1).toFixed(3)),
      };
    };
    console.log(
      JSON.stringify({
        fixture: 'two 512 KiB image responses',
        rounds,
        warmupPairsExcluded: 1,
        alternatingOrder: true,
        lifecycle:
          'page creation, load, extraction and close; both modes on the same browser and image',
        baseline: 'unfiltered control reproducing pre-optimization resource behavior',
        before: summarize('before'),
        after: summarize('after'),
        preservedPhotoUrls: measurements[0].after.urls.length,
        measurements,
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
    '--log-opt',
    'max-size=10m',
    '--log-opt',
    'max-file=3',
    '--rm',
    '--network=none',
    '--read-only',
    '--tmpfs=/tmp:rw,nosuid,size=256m',
    '--entrypoint=node',
    image,
    '--input-type=module',
    '-e',
    `await (${benchmark.toString()})(${rounds});`,
  ],
  { stdio: 'inherit', timeout: 180000 }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
