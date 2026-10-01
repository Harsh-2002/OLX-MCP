# OLX MCP

An MCP server for searching OLX listings and getting listing details.

Country adapters cover Portugal, Poland, Bulgaria, Romania, Ukraine, India,
Indonesia, Kazakhstan, and Uzbekistan. Live verification results are tracked per country. See [Country capabilities](docs/countries.md).

## Setup

Requires Node.js 22 or newer and npm.

```bash
git clone https://github.com/Harsh-2002/OLX-MCP.git
cd OLX-MCP
npm ci
npx playwright install chromium
npm run build
```

On Linux, use `npx playwright install --with-deps chromium` if browser system
libraries are missing.

Add this to your MCP client configuration, using your checkout's absolute path:

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

Restart the client after updating the configuration.

## Docker

```bash
docker build -t olx-mcp:local .
docker run --rm -i olx-mcp:local
```

The image includes Chromium and runs the stdio MCP server. See
[Docker](docs/docker.md) for client configuration and image checks.

## Tools

### `searchListings`

Requires `domain` and at least one of `query`, `category`, or `location`.
Optional filters include `minPrice`, `maxPrice`, `page`, `limit`, and `sortBy`.

```json
{
  "domain": "olx.in",
  "query": "mini pc",
  "location": "Mumbai",
  "maxPrice": 15000,
  "limit": 10
}
```

Domains: `olx.pt`, `olx.pl`, `olx.bg`, `olx.ro`, `olx.ua`, `olx.in`,
`olx.co.id`, `olx.kz`, and `olx.uz`.

Filters vary by country. Indonesia supports query, canonical location, limit, and up to ten
load-more batches; category, price, and custom sort filters return an explicit
unsupported-filter error.

India also supports up to ten load-more batches. For locations, use a supported city name such as Mumbai or Bengaluru, or an explicit
OLX route such as `mumbai_g4058997` or a numeric route returned by `searchLocations`.

### `searchLocations`

Look up live OLX location suggestions in India, Indonesia, Kazakhstan,
and Uzbekistan. Requires `domain` and `query`; accepts `parentId` when OLX exposes
parent metadata and an integer `limit` from 1 to 50 (default 20).

```json
{
  "domain": "olx.in",
  "query": "Aluva",
  "limit": 5
}
```

Pass a returned location's `searchValue` unchanged to `searchListings.location`.
Existing India aliases such as Mumbai still work; additional friendly names are
resolved live. Ambiguous names require a canonical value from this tool.

Lookup needs network access. Successful results are cached for ten minutes;
failed refreshes do not serve expired data. OLX may restrict automated access,
and sampled checks do not establish coverage of every locality.

### `getListingDetails`

Use a listing ID from a search on the same domain and running server.

```json
{
  "domain": "olx.in",
  "listingId": "1234567890",
  "includeImages": true,
  "includeSellerInfo": true
}
```

Both optional flags default to `true`. Seller information includes the name and
verification marker when available.

OLX markup changes and anti-bot checks can affect results. Prices remain
localized strings; some fields may be unavailable.

## Development

```bash
npm run dev
npm test
npm run ci
```

`npm run ci` checks linting, formatting, types, test coverage, and the build.
For live website checks, install Chromium and run `npm run test:integration`.

- [Contributing](CONTRIBUTING.md)
- [Architecture](docs/architecture.md)
- [Testing](tests/README.md)

## License

[MIT](LICENSE).
