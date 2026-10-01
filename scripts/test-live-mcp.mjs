import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { OLX_DOMAINS, LOCATION_DOMAINS } from '../dist/core/domains.js';

const imageOption = process.argv.slice(2).find(arg => arg.startsWith('--image='));
const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const domains = requested.length
  ? requested
  : ['olx.in', 'olx.com.br', 'olx.co.id', 'olx.kz', 'olx.uz', 'olx.pt', 'olx.pl'];
for (const domain of domains) assert(OLX_DOMAINS.includes(domain), `Unsupported domain: ${domain}`);
const image = imageOption?.slice('--image='.length);
const client = new Client({ name: 'olx-live-verification', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: image ? 'docker' : process.execPath,
  args: image
    ? ['run', '--rm', '-i', '--read-only', '--tmpfs=/tmp:rw,nosuid,size=256m', image]
    : ['dist/index.js'],
  stderr: 'inherit',
});
const queries = {
  'olx.in': ['Aluva', 'laptop'],
  'olx.com.br': ['São Paulo', 'notebook'],
  'olx.co.id': ['Jakarta Selatan', 'laptop'],
  'olx.kz': ['Алматы', 'ноутбук'],
  'olx.uz': ['Ташкент', 'ноутбук'],
  'olx.pt': ['', 'telefone'],
  'olx.pl': ['', 'telefon'],
};
const reports = [];
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert(!result.isError, `${name} returned a tool error`);
  const text = result.content.find(block => block.type === 'text');
  assert(text, 'MCP response has no text content');
  return JSON.parse(text.text);
}
try {
  await client.connect(transport);
  const discovered = await client.listTools();
  assert.deepEqual(discovered.tools.map(tool => tool.name).sort(), [
    'getListingDetails',
    'searchListings',
    'searchLocations',
  ]);
  console.log('MCP handshake and tool discovery passed');
  for (const domain of domains) {
    const [locationQuery, query] = queries[domain] ?? ['', 'laptop'];
    const report = {
      domain,
      locations: 'not-requested',
      search: 'not-run',
      details: 'not-run',
      pagination: 'not-run',
    };
    let location;
    if (LOCATION_DOMAINS.includes(domain)) {
      try {
        const result = await call('searchLocations', { domain, query: locationQuery, limit: 5 });
        assert(result.locations?.length, 'Location lookup returned no matches');
        location = result.locations[0].searchValue;
        assert(location, 'Location result has no canonical searchValue');
        report.locations = 'passed';
      } catch (error) {
        report.locations = error.message;
      }
    }
    try {
      const result = await call('searchListings', {
        domain,
        query,
        ...(location ? { location } : {}),
        limit: 2,
      });
      assert(result.listings?.length, 'Search returned no listings');
      report.search = location ? 'passed-with-location' : 'passed-countrywide';
      const details = await call('getListingDetails', { domain, listingId: result.listings[0].id });
      assert(details.title, 'Details have no title');
      assert.equal(details.id, result.listings[0].id);
      report.details = 'passed';
      if (result.hasNextPage) {
        const next = await call('searchListings', {
          domain,
          query,
          ...(location ? { location } : {}),
          limit: 2,
          page: 2,
        });
        assert.equal(next.currentPage, 2);
        assert(next.listings?.length, 'Second page has no listings');
        assert.notDeepEqual(
          next.listings.map(row => row.id),
          result.listings.map(row => row.id),
          'Pagination repeated the first page'
        );
        report.pagination = 'passed';
      } else report.pagination = 'no-next-page';
    } catch (error) {
      report.failure = error.message;
    }
    if (domain === 'olx.in') {
      try {
        const mumbai = await call('searchListings', {
          domain,
          query,
          location: 'Mumbai',
          limit: 2,
        });
        assert(mumbai.listings?.length, 'Mumbai search returned no listings');
        const details = await call('getListingDetails', {
          domain,
          listingId: mumbai.listings[0].id,
        });
        assert(details.title, 'Mumbai details have no title');
        report.mumbai = 'passed-search-and-details';
      } catch (error) {
        report.mumbai = error.message;
        report.failure ??= error.message;
      }
    }
    reports.push(report);
    // Only verification status is printed; seller and listing contents are not retained.
    console.log(JSON.stringify(report));
  }
} finally {
  await client.close();
}
const failed = reports.filter(
  report =>
    report.failure || (report.locations !== 'not-requested' && report.locations !== 'passed')
);
if (failed.length) {
  console.error(`${failed.length} domain checks failed`);
  process.exitCode = 1;
}
