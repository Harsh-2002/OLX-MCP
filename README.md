# OLX MCP

A Model Context Protocol (MCP) server that lets an MCP client search OLX listings
and retrieve listing details using a headless browser.

Maintained independently at [Harsh-2002/OLX-MCP](https://github.com/Harsh-2002/OLX-MCP).

## Features

- Two tools: `searchListings` and `getListingDetails`.
- Six configured country sites: Portugal, Poland, Bulgaria, Romania, Ukraine, and India.
- Search filters for query, category, location, price range, sorting, and page number.
- Optional gallery images and seller information on detail requests.
- Shared browser process, isolated pages for each operation, and bounded listing URL caches.

This project scrapes public website markup. Site changes, unavailable listings,
anti-bot checks, and network failures can affect results. Unit tests use mocked
browsers; they do not establish that every country site currently works.

## Requirements

- Node.js 22 or newer; `.nvmrc` selects Node.js 24 for development.
- npm.
- Playwright Chromium and its operating-system dependencies.

## Run from source

Source installation is the supported path for this independent repository.

```bash
git clone https://github.com/Harsh-2002/OLX-MCP.git
cd OLX-MCP
npm ci
npx playwright install chromium
npm run build
```

On Linux, if browser system libraries are missing, run
`npx playwright install --with-deps chromium` with the permissions needed to
install system packages. Dependency installation does not install browsers automatically.

Add the following to your MCP client's server configuration, replacing the path
with your checkout's absolute path:

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/OLX-MCP/dist/index.js"]
    }
  }
}
```

Restart the client after updating its configuration. A copyable example is in
[examples/claude_desktop_config.json](examples/claude_desktop_config.json).
The server uses standard input and output for MCP traffic and standard error for logs.

The independent npm package name is `@harsh-2002/olx-mcp`; publication is a
maintainer step described in [Contributing](CONTRIBUTING.md#releases).

## Tools

### `searchListings`

Search a single country site. `domain` and at least one of `query`, `category`, or
`location` are required.

| Parameter  | Type   | Default     | Description                                                   |
| ---------- | ------ | ----------- | ------------------------------------------------------------- |
| `domain`   | string | Required    | `olx.pt`, `olx.pl`, `olx.bg`, `olx.ro`, `olx.ua`, or `olx.in` |
| `query`    | string | Omitted     | Search text, 1–100 characters                                 |
| `category` | string | Omitted     | Country-specific category value                               |
| `location` | string | Omitted     | Country-specific location; see India notes below              |
| `minPrice` | number | Omitted     | Nonnegative minimum price                                     |
| `maxPrice` | number | Omitted     | Nonnegative maximum price                                     |
| `page`     | number | `1`         | OLX page number, starting at 1                                |
| `limit`    | number | `20`        | Maximum listings returned from that page, up to 50            |
| `sortBy`   | string | `relevance` | `relevance`, `date`, `price-asc`, or `price-desc`             |

Example arguments:

```json
{
  "domain": "olx.in",
  "query": "mini pc",
  "location": "Mumbai",
  "maxPrice": 15000,
  "limit": 10
}
```

The result contains `listings`, `totalCount`, `currentPage`, `totalPages`, and
`hasNextPage`. `limit` truncates the current site's page; it does not change OLX's
page size. Page counts are estimates derived from the site's reported count and
number of cards on the fetched page.

For India, friendly names such as Delhi, Mumbai, Bengaluru, Hyderabad, Chennai,
Kolkata, Pune, and Ahmedabad map to canonical OLX location slugs. Explicit slugs
such as `mumbai_g4058997` also work. Unknown friendly names are rejected.
The full mapping is in [olx-india-locations.ts](src/scrapers/olx/olx-india-locations.ts).

### `getListingDetails`

| Parameter           | Type    | Default  | Description                                              |
| ------------------- | ------- | -------- | -------------------------------------------------------- |
| `domain`            | string  | Required | One of the six supported domain values                   |
| `listingId`         | string  | Required | Listing ID returned by a search                          |
| `includeImages`     | boolean | `true`   | Extract gallery URLs and the first image as `imageUrl`   |
| `includeSellerInfo` | boolean | `true`   | Extract seller name and verification marker when present |

Use an ID from `searchListings` on the same domain and running server:

```json
{
  "domain": "olx.in",
  "listingId": "1234567890",
  "includeImages": true,
  "includeSellerInfo": true
}
```

The result contains the listing's ID, title, URL, and available optional fields.
Prices remain localized strings. Seller phone numbers, membership dates,
publication dates, category extraction, and category/location discovery tools
are not implemented, even though some related types and selectors exist.

Search results cache listing URLs in memory. For an uncached ID, India uses a
direct item route; other domains try a search-by-ID fallback. Searching first is
the most reliable way to resolve detail requests. Caches disappear when the
server exits.

## Development

```bash
npm run dev
npm test
npm run ci
```

`npm run dev` runs the TypeScript entry point; it does not watch for changes.
`npm run ci` runs linting, formatting checks, type checking, the full mocked test
suite with coverage, and the production build. Browsers are unnecessary for that
suite. Live website checks are separate:

```bash
npm run test:integration
```

See [Contributing](CONTRIBUTING.md), [Architecture](docs/architecture.md), and
[Testing](tests/README.md) for the workflow, module boundaries, and validation limits.

## Troubleshooting

- **Chromium executable missing:** install the browser with `npx playwright install chromium`.
- **Missing system libraries:** on Linux, install dependencies with `npx playwright install --with-deps chromium`.
- **No listing details for an ID:** search first in the same server process and domain.
- **Selector errors or unexpected empty results:** report the domain, sanitized tool arguments, and error message.
- **Client cannot connect:** check the absolute entry-point path and run `npm run build` after source changes.

## License

[MIT](LICENSE). The original copyright notice is retained for inherited code;
the license also identifies this project's maintainers and contributors.
