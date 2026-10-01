#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { OlxScraperFactory } from './dist/scrapers/olx/scraper.factory.js';
import { SearchListingsTool } from './dist/tools/search/search-listings.tool.js';
import { GetListingDetailsTool } from './dist/tools/listing/get-listing-details.tool.js';
import { getSupportedDomains } from './dist/scrapers/olx/domain-config.js';
import { SearchListingsArgsSchema } from './dist/validation/schemas/listing.schema.js';

async function main() {
  const requestedDomains = process.argv.slice(2);
  const domains = requestedDomains.length > 0 ? requestedDomains : ['olx.pt', 'olx.pl', 'olx.in'];
  const supportedDomains = getSupportedDomains();
  for (const domain of domains) {
    assert(supportedDomains.includes(domain), `Unsupported domain: ${domain}`);
  }

  assert.equal(SearchListingsArgsSchema.parse({ domain: 'olx.in', query: 'test' }).page, 1);
  assert.throws(() => SearchListingsArgsSchema.parse({ query: 'test' }));
  assert.throws(() => SearchListingsArgsSchema.parse({ domain: 'olx.invalid', query: 'test' }));

  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  try {
    const factory = new OlxScraperFactory(browser);
    const searchTool = new SearchListingsTool(factory);
    const detailsTool = new GetListingDetailsTool(factory);

    for (const domain of domains) {
      try {
        const query =
          domain === 'olx.pl' ? 'telefon' : domain === 'olx.in' ? 'mini pc' : 'telefone';
        const search = await searchTool.execute({ domain, query, limit: 3 });
        assert(search.success, search.success ? '' : search.error.message);
        assert(
          search.data.listings.length > 0,
          'Search returned no listings; detail check cannot run'
        );

        const first = search.data.listings[0];
        const details = await detailsTool.execute({ domain, listingId: first.id });
        assert(details.success, details.success ? '' : details.error.message);
        assert(details.data.title, 'Detail page has no title');
        assert.equal(details.data.id, first.id);
        console.log(`${domain}: search and detail check passed`);
      } catch (error) {
        failures++;
        console.error(`${domain}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    throw new Error(`${failures} live domain check(s) failed`);
  }
}

main().catch(error => {
  console.error(
    'Integration check failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
