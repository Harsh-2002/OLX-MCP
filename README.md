# OLX MCP

An MCP server for searching OLX listings and getting listing details.

Supports Portugal, Poland, Bulgaria, Romania, Ukraine, and India.

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

Domains: `olx.pt`, `olx.pl`, `olx.bg`, `olx.ro`, `olx.ua`, and `olx.in`.

For India, use a supported city name such as Mumbai or Bengaluru, or an explicit
OLX location slug such as `mumbai_g4058997`.

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
