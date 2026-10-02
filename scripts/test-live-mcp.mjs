import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { OLX_DOMAINS, LOCATION_DOMAINS } from '../dist/core/domains.js';

const imageOption = process.argv.slice(2).find(arg => arg.startsWith('--image='));
const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const domains = requested.length ? requested : [...OLX_DOMAINS];
for (const domain of domains) assert(OLX_DOMAINS.includes(domain), `Unsupported domain: ${domain}`);
const checkImages = process.argv.includes('--images');
const image = imageOption?.slice('--image='.length);
const client = new Client(
  { name: 'olx-live-verification', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } }
);
const transport = new StdioClientTransport({
  command: image ? 'docker' : process.execPath,
  args: image
    ? ['run', '--rm', '-i', '--read-only', '--tmpfs=/tmp:rw,nosuid,size=256m', image]
    : ['dist/index.js'],
  stderr: 'inherit',
});
const queries = {
  'olx.in': ['Aluva', 'laptop'],
  'olx.co.id': ['Jakarta Selatan', 'laptop'],
  'olx.kz': ['Алматы', 'ноутбук'],
  'olx.uz': ['Ташкент', 'ноутбук'],
  'olx.pt': ['', 'telefone'],
  'olx.pl': ['', 'telefon'],
  'olx.bg': ['', 'лаптоп'],
  'olx.ro': ['', 'laptop'],
  'olx.ua': ['', 'ноутбук'],
};
const reports = [];
async function call(name, args) {
  const started = Date.now();
  console.log(
    JSON.stringify({
      domain: args.domain,
      operation: name,
      page: args.page ?? 1,
      status: 'started',
    })
  );
  const result = await client.callTool({ name, arguments: args }, { timeout: 120000 });
  assert(
    !result.isError,
    `${name}: ${result.content?.find(block => block.type === 'text')?.text ?? 'tool error'}`
  );
  assert(result.structuredContent, 'Missing structured tool output');
  const text = result.content.find(block => block.type === 'text');
  assert(text, 'MCP response has no text content');
  console.log(
    JSON.stringify({
      domain: args.domain,
      operation: name,
      elapsedMs: Date.now() - started,
      status: 'completed',
    })
  );
  assert.deepEqual(JSON.parse(text.text), result.structuredContent);
  return result.structuredContent;
}
try {
  await client.connect(transport);
  const discovered = await client.listTools();
  assert.deepEqual(discovered.tools.map(tool => tool.name).sort(), [
    'getListingDetails',
    'getListingImages',
    'searchListings',
    'searchLocations',
  ]);
  console.log('MCP 2026-07-28 discovery and tool schemas passed');
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
      try {
        const details = await call('getListingDetails', {
          domain,
          listingId: result.listings[0].id,
        });
        assert(details.title, 'Details have no title');
        assert(details.price, 'Details have no displayed price');
        assert.equal(details.id, result.listings[0].id);
        report.details = 'passed';
        if (checkImages) {
          try {
            const photos = await client.callTool(
              {
                name: 'getListingImages',
                arguments: { domain, listingId: result.listings[0].id, limit: 1 },
              },
              { timeout: 120000 }
            );
            assert(
              !photos.isError,
              `Photo tool failed: ${photos.content?.find(block => block.type === 'text')?.text ?? 'unknown error'}`
            );
            const imageBlocks = photos.content.filter(block => block.type === 'image');
            assert.equal(imageBlocks.length, 1, 'Expected one native MCP image block');
            assert(
              ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
                imageBlocks[0].mimeType
              )
            );
            const bytes = Buffer.from(imageBlocks[0].data, 'base64');
            assert(bytes.length > 0 && bytes.length <= 2 * 1024 * 1024);
            const metadata = JSON.parse(photos.content.find(block => block.type === 'text').text);
            assert.deepEqual(metadata, photos.structuredContent);
            assert.equal(metadata.images[0].byteLength, bytes.length);
            assert.equal(metadata.listingId, result.listings[0].id);
            assert(metadata.images[0].url.startsWith('https://'));
            report.images = {
              status: 'passed',
              mimeType: imageBlocks[0].mimeType,
              byteLength: bytes.length,
            };
          } catch (error) {
            report.images = { status: 'failed', error: error.message };
            report.failure = error.message;
          }
        }
      } catch (error) {
        report.details = error.message;
        report.failure = error.message;
      }
      if (result.hasNextPage) {
        try {
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
        } catch (error) {
          report.pagination = error.message;
          report.failure ??= error.message;
        }
      } else report.pagination = 'no-next-page';
    } catch (error) {
      report.search = 'failed';
      report.failure = error.message;
    }
    if (domain === 'olx.in') {
      try {
        const first = await call('searchListings', { domain, query, limit: 2 });
        assert(first.listings?.length, 'India countrywide search returned no listings');
        if (first.hasNextPage) {
          const next = await call('searchListings', { domain, query, limit: 2, page: 2 });
          assert(next.listings?.length, 'India countrywide second batch has no listings');
          assert.notDeepEqual(
            next.listings.map(row => row.id),
            first.listings.map(row => row.id),
            'India countrywide pagination repeated the first batch'
          );
          report.countrywidePagination = 'passed';
        } else report.countrywidePagination = 'no-next-page';
      } catch (error) {
        report.countrywidePagination = error.message;
        report.failure ??= error.message;
      }

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
        assert(details.price, 'Mumbai details have no displayed price');
        report.mumbai = 'passed-search-and-details';
        if (mumbai.hasNextPage) {
          const next = await call('searchListings', {
            domain,
            query,
            location: 'Mumbai',
            limit: 2,
            page: 2,
          });
          assert(next.listings?.length, 'Mumbai second batch has no listings');
          assert.notDeepEqual(
            next.listings.map(row => row.id),
            mumbai.listings.map(row => row.id),
            'Mumbai pagination repeated the first batch'
          );
          report.mumbaiPagination = 'passed';
        } else report.mumbaiPagination = 'no-next-page';
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
