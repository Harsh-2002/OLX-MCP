import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const previous = process.argv[2] ?? 'olx-mcp:performance';
const current = process.argv[3] ?? 'olx-mcp:local';
const rounds = 5;
const calls = 10;

// The actual compiled server and Chromium run in both images. Tool execution
// returns fixed results: input validation, scraping and downloads are excluded.
const fixture = `
import { OLXMCPServer } from './dist/core/server.js';
const server = new OLXMCPServer({ name: 'olx-benchmark', version: '1' });
await server.initialize();
const listings = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1), title: 'Benchmark laptop ' + i, price: '10000 INR',
  location: 'Benchmark city', url: 'https://www.olx.in/item/benchmark-iid-' + (i + 1),
  imageUrl: 'https://apollo.olx.in/benchmark.png',
}));
const photo = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64'), Buffer.alloc(4096)]);
server.registry.get('searchListings').execute = async () => ({ success: true, data: {
  listings, totalCount: 10, currentPage: 1, totalPages: 1, hasNextPage: false,
} });
server.registry.get('getListingImages').execute = async () => ({ success: true, data: {
  listingId: '1', title: 'Benchmark laptop', listingUrl: listings[0].url, warnings: [],
  images: [{ url: 'https://apollo.olx.in/benchmark.png', mimeType: 'image/png', data: photo.toString('base64'), byteLength: photo.length }],
} });
if (typeof server.serve === 'function') server.serve();
else {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  await server.connect(new StdioServerTransport());
  server.getServer().onclose = () => { void server.cleanup(); };
}
`;

const operations = {
  catalog: { method: 'tools/list' },
  search: {
    method: 'tools/call',
    params: { name: 'searchListings', arguments: { domain: 'olx.in', query: 'laptop', limit: 10 } },
  },
  photo: {
    method: 'tools/call',
    params: { name: 'getListingImages', arguments: { domain: 'olx.in', listingId: '1' } },
  },
};

async function measure(image, modern) {
  const client = new Client(
    { name: 'benchmark', version: '1' },
    {
      versionNegotiation: { mode: modern ? { pin: '2026-07-28' } : 'legacy' },
    }
  );
  const transport = new StdioClientTransport({
    command: 'docker',
    args: [
      'run',
      '--log-opt',
      'max-size=10m',
      '--log-opt',
      'max-file=3',
      '--rm',
      '-i',
      '--network=none',
      '--read-only',
      '--tmpfs=/tmp:rw,nosuid,size=256m',
      '--shm-size=256m',
      '--entrypoint=node',
      image,
      '--input-type=module',
      '-e',
      fixture,
    ],
    stderr: 'pipe',
  });
  const start = performance.now();
  try {
    await client.connect(transport);
    const startupMs = performance.now() - start;
    let responseBytes = 0;
    let responseCount = 0;
    const receive = transport.onmessage;
    transport.onmessage = (message, ...extra) => {
      if ('result' in message) {
        responseBytes = Buffer.byteLength(JSON.stringify(message)) + 1;
        responseCount++;
      }
      receive(message, ...extra);
    };
    const samples = {};
    for (const [name, request] of Object.entries(operations)) {
      // Direct requests deliberately bypass catalog response caching. One
      // unmeasured call warms each path before collecting latency samples.
      await client.request(request, { timeout: 30000 });
      samples[name] = [];
      for (let i = 0; i < calls; i++) {
        const count = responseCount;
        const started = performance.now();
        const result = await client.request(request, { timeout: 30000 });
        const elapsedMs = performance.now() - started;
        assert.equal(responseCount, count + 1, 'Every measured call must cross stdio');
        assert(!result.isError);
        if (name === 'catalog') assert.equal(result.tools.length, 4);
        if (name === 'search') {
          const text = result.content.find(block => block.type === 'text');
          assert.equal(JSON.parse(text.text).listings.length, 10);
          if (modern) assert.equal(result.structuredContent.listings.length, 10);
        }
        if (name === 'photo') {
          const imageBlock = result.content.find(block => block.type === 'image');
          assert.equal(Buffer.from(imageBlock.data, 'base64').length, 4164);
        }
        samples[name].push({ elapsedMs, responseBytes });
      }
    }
    await client.listTools();
    samples.cachedCatalog = [];
    for (let i = 0; i < calls; i++) {
      const count = responseCount;
      const started = performance.now();
      const result = await client.listTools();
      const elapsedMs = performance.now() - started;
      assert.equal(result.tools.length, 4);
      samples.cachedCatalog.push({
        elapsedMs,
        responseBytes: responseCount === count ? 0 : responseBytes,
        wireResponses: responseCount - count,
      });
    }
    return { startupMs, samples };
  } finally {
    await client.close();
  }
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    count: sorted.length,
    median: Number(median.toFixed(3)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted.at(-1).toFixed(3)),
  };
}
const results = { previous: [], current: [] };
for (let round = 0; round <= rounds; round++) {
  const order = round % 2 ? ['current', 'previous'] : ['previous', 'current'];
  for (const name of order) {
    const measurement = await measure(name === 'previous' ? previous : current, name === 'current');
    if (round > 0) results[name].push(measurement);
    console.error(`${round === 0 ? 'warmup' : `round ${round}`}: ${name} completed`);
  }
}

const summary = {};
for (const [name, runs] of Object.entries(results)) {
  const image = name === 'previous' ? previous : current;
  const [identity] = JSON.parse(
    execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' })
  );
  summary[name] = {
    image,
    imageId: identity.Id,
    imageBytes: identity.Size,
    startupMs: stats(runs.map(run => run.startupMs)),
    operations: {},
  };
  for (const operation of [...Object.keys(operations), 'cachedCatalog']) {
    const samples = runs.flatMap(run => run.samples[operation]);
    summary[name].operations[operation] = {
      latencyMs: stats(samples.map(sample => sample.elapsedMs)),
      responseBytes: stats(samples.map(sample => sample.responseBytes)),
      ...(operation === 'cachedCatalog'
        ? { totalWireResponses: samples.reduce((sum, sample) => sum + sample.wireResponses, 0) }
        : {}),
    };
  }
}
console.log(
  JSON.stringify(
    {
      date: new Date().toISOString(),
      methodology: {
        rounds,
        callsPerOperationPerRound: calls,
        warmupPairsExcluded: 1,
        operationWarmupsExcluded: 1,
        alternatingOrder: true,
        outboundNetwork: false,
        fixture:
          '10 synthetic listings and one 4164-byte PNG; actual compiled server, Chromium and stdio; direct requests bypass catalog cache',
        startupScope:
          'Docker launch, Node/SDK, Chromium and protocol connection; fixture harness rather than unmodified CLI',
        liveOlxLatencyMeasured: false,
        excludedWork: ['tool input validation', 'scraping', 'photo downloading', 'vision analysis'],
      },
      summary,
      runs: results,
    },
    null,
    2
  )
);
