import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { OLX_DOMAINS } from '../dist/core/domains.js';

const option = name =>
  process.argv
    .slice(2)
    .find(arg => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const image =
  option('image') ??
  'lightpanda/browser@sha256:39e89483ef14a50539b8d37a44073b8c89147c7cc37d6c1c569076a120315b2b';
const container = `olx-lightpanda-validation-${process.pid}`;
const sanitize = text =>
  stripVTControlCharacters(text)
    .split('\n')[0]
    .replace(/https?:\/\/\S+/g, '[URL]');
const report = {
  checkedAt: new Date().toISOString(),
  image,
  architecture: '',
  browserVersion: '',
  imageBytes: 0,
  playwrightVersion: JSON.parse(
    readFileSync(new URL('../node_modules/playwright/package.json', import.meta.url), 'utf8')
  ).version,
  memoryLimitBytes: 1024 ** 3,
  capabilities: [],
  countries: [],
};
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 }).trim();
let created = false;

async function freshEndpoint() {
  if (created) {
    docker(['rm', '-f', container]);
    created = false;
  }
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--user=1000:1000',
    '--read-only',
    '--tmpfs=/tmp:rw,nosuid,size=128m',
    '--memory=1g',
    '--pids-limit=256',
    '--log-opt=max-size=10m',
    '--log-opt=max-file=3',
    '-e',
    'HOME=/tmp',
    '-e',
    'LIGHTPANDA_DISABLE_TELEMETRY=true',
    '-p',
    '127.0.0.1::9222',
    image,
  ]);
  created = true;
  // Each clean container receives a new ephemeral host port. Use the mapped WebSocket
  // directly, since Lightpanda's HTTP discovery advertises its internal port.
  const address = docker(['port', container, '9222/tcp']);
  await new Promise(resolve => setTimeout(resolve, 300));
  return `ws://${address}/`;
}

async function probe(name, test) {
  let browser;
  const result = { name, status: 'failed' };
  try {
    browser = await chromium.connectOverCDP(await freshEndpoint(), { timeout: 15000 });
    await test(browser);
    result.status = 'passed';
  } catch (error) {
    result.error = sanitize(error.message.split('\n')[0]);
  } finally {
    if (browser) {
      await Promise.allSettled(browser.contexts().map(context => context.close()));
      await Promise.allSettled([browser.close()]);
    }
  }
  report.capabilities.push(result);
  console.log(JSON.stringify(result));
}

try {
  await freshEndpoint();
  const metadata = JSON.parse(docker(['image', 'inspect', image]))[0];
  report.architecture = metadata.Architecture;
  report.imageBytes = metadata.Size;
  report.browserVersion = docker(['exec', container, '/bin/lightpanda', 'version']);

  await probe('dom-extraction', async browser => {
    const page = await browser.newPage();
    await page.setContent('<h1>Fixture</h1><button>Load more</button>');
    assert.equal(await page.locator('h1').textContent(), 'Fixture');
    assert.equal(await page.getByRole('button', { name: 'Load more' }).isVisible(), true);
  });
  await probe('button-click', async browser => {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setContent('<h1>Fixture</h1><button>Load more</button>');
    assert.equal(await page.locator('h1').textContent(), 'Fixture');
    assert.equal(await page.getByRole('button', { name: 'Load more' }).isVisible(), true);
    await page.evaluate(() =>
      document.querySelector('button').addEventListener('click', () => {
        document.body.setAttribute('data-clicked', 'yes');
      })
    );
    await page.getByRole('button', { name: 'Load more' }).click();
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-clicked')), 'yes');
  });
  await probe('disable-javascript', async browser => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setContent('<h1>Fixture</h1><script>document.querySelector("h1").remove()</script>');
    assert.equal(await page.locator('h1').textContent(), 'Fixture');
  });
  await probe('four-isolated-contexts', async browser => {
    const contexts = [];
    for (let index = 0; index < 4; index++) contexts.push(await browser.newContext());
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    await Promise.all(pages.map((page, index) => page.setContent(`<h1>Fixture ${index}</h1>`)));
    assert.deepEqual(await Promise.all(pages.map(page => page.locator('h1').textContent())), [
      'Fixture 0',
      'Fixture 1',
      'Fixture 2',
      'Fixture 3',
    ]);
  });

  // Isolate every country from contexts left behind by an unsupported CDP call.
  // The existing live matrix exercises the real MCP server and its production adapters.
  for (const domain of OLX_DOMAINS) {
    const endpoint = await freshEndpoint();
    const check = spawnSync(
      process.execPath,
      ['scripts/test-live-mcp.mjs', `--cdp=${endpoint}`, '--images', domain],
      { encoding: 'utf8', timeout: 300000, maxBuffer: 8 * 1024 * 1024 }
    );
    let result;
    for (const line of (check.stdout ?? '').split('\n')) {
      try {
        const entry = JSON.parse(line);
        if (entry.domain === domain && 'search' in entry) result = entry;
      } catch {
        /* The live runner also emits plain diagnostic messages. */
      }
    }
    result ??= {
      domain,
      search: 'not-completed',
      failure:
        check.error?.code === 'ETIMEDOUT'
          ? 'Country runner exceeded the 300-second limit'
          : 'Runner did not produce a country summary',
    };
    // Keep status/timing metadata only; the live runner never prints listing contents.
    result = Object.fromEntries(
      Object.entries(result).map(([key, value]) => [
        key,
        typeof value === 'string' ? sanitize(value) : value,
      ])
    );
    result.exitCode = check.status;
    if (check.error) result.runnerError = check.error.code ?? 'RUNNER_ERROR';
    report.countries.push(result);
    console.log(JSON.stringify(result));
  }
  report.containerState = JSON.parse(docker(['inspect', container]))[0].State;
  // Runtime PID and container IDs are unnecessary for a reproducible result.
  delete report.containerState.Pid;
  const passed =
    report.capabilities.every(check => check.status === 'passed') &&
    report.countries.length === OLX_DOMAINS.length &&
    report.countries.every(check => check.exitCode === 0);
  report.status = passed ? 'passed' : 'failed';
  if (option('output')) writeFileSync(option('output'), `${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = passed ? 0 : 1;
} finally {
  if (created) docker(['rm', '-f', container]);
}
