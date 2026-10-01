# Architecture

## Purpose and boundaries

OLX MCP is a local stdio MCP server. It has no HTTP service, database,
authentication system, background worker, or persistent listing store.
It launches full Chromium through Playwright's `chromium` channel in new headless
mode and reads public OLX search and detail pages.

The runtime dependencies are the MCP TypeScript SDK, Playwright, Zod, and
`zod-to-json-schema`. TypeScript builds ESM output in `dist/`.

## Request flow

```text
MCP client
  -> stdio transport (src/index.ts)
  -> MCP request handlers (src/core/server.ts)
  -> tool registry
  -> tool argument validation (BaseTool + Zod schema)
  -> searchListings, getListingDetails, or searchLocations adapter
  -> cached domain scraper (OlxScraperFactory)
  -> isolated Playwright page
  -> OLX DOM extraction
  -> Result<T>
  -> JSON text in the MCP response
```

`OLXMCPServer.initialize()` launches a shared browser, creates the scraper factory,
and registers three tools before connecting the transport. Tool discovery converts
Zod schemas to JSON Schema. Tool failures become thrown errors at the MCP handler;
successes are serialized into one text content block.

`src/index.ts` installs shutdown handlers and delegates cleanup to the server.
The executable wrapper in `bin/` starts the compiled entry point and forwards signals.

## Modules

| Path                                        | Responsibility                                             |
| ------------------------------------------- | ---------------------------------------------------------- |
| `src/core/server.ts`                        | Browser ownership, MCP tool discovery and invocation       |
| `src/core/tool-registry.ts`                 | Named tool registration and lookup                         |
| `src/core/types.ts`                         | Listing, search, configuration, and `Result` contracts     |
| `src/tools/base/base-tool.ts`               | Argument validation and exception-to-`Result` conversion   |
| `src/locations/`                            | Native HTTP/2 and browser location lookup, bounded caching |
| `src/scrapers/olx/load-more-olx.scraper.ts` | Shared India/Indonesia batch loading and offsets           |
| `src/tools/search/`                         | Search tool adapter                                        |
| `src/tools/listing/`                        | Detail tool adapter                                        |
| `src/validation/schemas/listing.schema.ts`  | Input validation and additional unused schemas             |
| `src/scrapers/base/scraper.interface.ts`    | Page lifecycle, timeouts, retries                          |
| `src/scrapers/olx/base-olx.scraper.ts`      | Shared URL building, search/detail extraction, URL caching |
| `src/scrapers/olx/domain-config.ts`         | Per-domain URLs, selectors, currencies, languages          |
| `src/scrapers/olx/dom-extractors.ts`        | Self-contained browser-side extraction functions           |
| `src/scrapers/olx/olx-india-locations.ts`   | Friendly-name and explicit-slug resolution for India       |

## Country behavior

Portugal and Poland use thin subclasses that bind the shared scraper to a domain.
Bulgaria, Romania, and Ukraine use the generic scraper with their domain configuration.
Kazakhstan and Uzbekistan share a dedicated adapter for native category paths
and `/list/` queries. India and Indonesia share a load-more adapter with isolated per-page offsets and native iid IDs. New-country selectors remain subject to live verification.
The five European configurations currently share selectors; this is an implementation
assumption that needs live verification when site markup changes.

India uses separate `data-aut-id` selectors, `/items/` search paths, canonical
location identifiers, and `iid-` listing IDs. Its subclass waits for DOM content
rather than network idle, accepts a summary element as a search-ready signal,
uses a direct item URL for uncached detail requests, and waits for gallery images.

Queries preserve non-ASCII letters and digits. Polish and Romanian folding tables
normalize selected diacritics; other non-ASCII query slugs are percent-encoded.

## Browser lifecycle and retries

The factory lazily creates and caches one scraper per requested domain. Each
operation creates a new page via `browser.newPage()` and closes it in `finally`.
The browser process is shared; pages do not retain an authenticated user session.
European and Central Asian search pages disable page JavaScript and read the
server-rendered HTML. This avoids client chunk failures and hydration changing
valid result cards during extraction. Polish details also read server-rendered HTML and select the title heading within its wrapper.
Other detail pages and browser location pickers retain JavaScript; India and Indonesia need it for load-more navigation.

The default page timeout is 30 seconds. Operations make up to three attempts,
with exponential backoff between failures. `NonRetryableError` bypasses retry
for detected stale selectors and missing detail-page titles.

The MCP handler forwards request cancellation signals to tools. Abort checks exist
at several boundaries. In-flight navigation and retry delays are not actively
cancelled. There is no concurrency limiter or global operation deadline.

## Search and detail data

Search cards are extracted in one browser evaluation, then mapped to typed listings.
Malformed links and cards missing titles are skipped. If cards exist but none
can be parsed, the operation fails rather than pretending there were no matches.
A first-page count greater than zero with no matched cards also produces an error.

Each scraper caches up to 2,000 ID-to-URL entries, evicting the oldest entry when
full. This is a URL lookup cache, not a listing-content cache. European IDs usually
come from `ID<id>.html`; links without a recognizable ID receive a stable URL hash.
Synthetic IDs are useful only while their URL remains cached.

Detail lookup first uses a cached URL, then a direct domain route when available,
then a search-by-ID fallback. Images and seller extraction can be skipped through
tool options. DOM extractors remove section headings and price badges, and deduplicate
gallery URLs. Optional selector failures commonly yield absent or empty fields.

Prices remain localized strings. Pagination totals are estimates and may vary on
short final pages. Output schemas exist but are not applied to scraper responses.

## Current limits

- Category discovery and older location schemas remain unused. Live location discovery is implemented separately for India and the three new markets.
- Publication dates, seller phone numbers and membership dates, categories, and attributes are not extracted.
- Browser mocks test local behavior; they do not verify current live selectors or anti-bot behavior.
- Page and limit arguments require integers. Price bounds, including zero, are validated and passed to supported domain filters.
- Indonesia category/price/sort filters are not implemented; those requests fail explicitly.
- Seller verification is inferred from a DOM marker rather than independently verified.

## Extension points

For a selector or URL-pattern change, update the domain configuration and add a
regression fixture. For country-specific lifecycle or ID behavior, override the
small protected hooks in a scraper subclass. Add a tool only when its scraper
behavior and input/output contract are implemented, then register it in the server.

See [Testing](../tests/README.md) for mocked and live validation boundaries.

## Container packaging

The multistage `Dockerfile` compiles TypeScript and installs production
dependencies in separate stages. The non-root runtime includes only the
application, production dependencies, headless Chromium, its system libraries,
and Tini. The image uses the same stdio entry point as a source installation.
See [Docker](docker.md) for build, client configuration, and offline smoke checks.

## Live location lookup

`LocationService` caches successful live queries for ten minutes and coalesces
identical pending requests. Each domain has at most 200 cached entries.
`OlxLocationProvider` dispatches India and Indonesia to `NativeLocationProvider`, which reads the public native autocomplete endpoint over HTTP/2. Numeric `_g` routes use actual upstream IDs. Requests have a 15-second absolute deadline and a 1 MiB response limit; sessions close on success and every failure.
`BrowserLocationProvider` handles Kazakhstan and Uzbekistan with a page per lookup and a 30-second deadline. `SearchLocationsTool` exposes canonical values
without inventing IDs or parent metadata. Search resolves additional friendly
names through the same service and refuses ambiguous matches.

Only location metadata is cached, never listing contents or seller data.
Coverage and live availability are documented in [Countries](countries.md).
