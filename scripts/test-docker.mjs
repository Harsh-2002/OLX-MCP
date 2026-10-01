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
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
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
