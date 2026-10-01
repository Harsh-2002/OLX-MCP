# Country capabilities

The MCP schemas accept ten domains. An adapter being present does not guarantee
that OLX allows automated access from a particular network. Brazil and Indonesia
remain experimental. Kazakhstan and Uzbekistan passed live location, search,
details, and pagination checks in the implementation environment.

| Country    | Domain       | Currency metadata | Search behavior                                                                              |
| ---------- | ------------ | ----------------- | -------------------------------------------------------------------------------------------- |
| Portugal   | `olx.pt`     | EUR               | Existing European adapter                                                                    |
| Poland     | `olx.pl`     | PLN               | Existing European adapter                                                                    |
| Bulgaria   | `olx.bg`     | BGN               | Existing European configuration                                                              |
| Romania    | `olx.ro`     | RON               | Existing European configuration                                                              |
| Ukraine    | `olx.ua`     | UAH               | Existing European configuration                                                              |
| India      | `olx.in`     | INR               | Existing legacy adapter, aliases and live location resolution                                |
| Brazil     | `olx.com.br` | BRL               | Separate card layout, query parameters and native category paths; custom sorting unavailable |
| Indonesia  | `olx.co.id`  | IDR               | Legacy cards and iid IDs; query, location and limit; load-more batches 1–10                  |
| Kazakhstan | `olx.kz`     | KZT               | `/list/` search routes, native category paths, Unicode queries                               |
| Uzbekistan | `olx.uz`     | UZS               | `/list/` search routes, native category paths, Unicode queries                               |

Prices remain the site's displayed strings. Currency metadata does not convert
prices; Uzbekistan can display different currency units. Use the site's native
price-filter units. Pagination totals are estimates; Indonesia's `page` selects
a load-more batch, and `limit` caps returned listings rather than defining batch
size. Batches can overlap if listings change between requests.

## Location inputs

Use `searchLocations` for India and the four new markets. It reads the public
location picker and accepts canonical values from public suggestion responses or
location links. It does not invent API endpoints or derive IDs from city names.
The legacy city directory is a live fallback when its picker exposes no canonical
values. The India directory inspected during research contained only 100 unique
city slugs, so it cannot establish complete locality coverage.

Location output includes `id`, `name`, `type`, and `searchValue`. Parent IDs and
region names appear only when OLX provides them. A `searchValue` is a route token,
not necessarily the same as `id`; pass `searchValue` to listing search.

India and Indonesia use identifiers such as `aluva_g4395807` and
`jakarta-selatan_g4000030`. Brazil uses regional paths such as
`estado-sp/sao-paulo-e-regiao/sao-paulo`. Kazakhstan and Uzbekistan use native
location route slugs: the live picker returns `alma-ata` for Алматы and
`tashkent` for Ташкент. District suggestions on these two sites need additional
native filters and are currently omitted, rather than silently converted to city
searches. Category inputs for Brazil, Kazakhstan, and Uzbekistan
are native paths, for example `informatica/notebooks` or
`elektronika/kompyutery/noutbuki`.

Unknown and ambiguous friendly names produce an error with lookup guidance.
Directory fallback cannot supply missing parent metadata or unlisted localities;
those cases produce an explicit coverage error. Do not interpret that error as
proof that a locality does not exist.

Opaque pickers may return a single canonical match because each further selection
requires another navigation. Location calls have a 30-second provider deadline. Successful queries are cached
for ten minutes, at most 200 entries per domain; identical pending queries share
one fetch. A caller can cancel without cancelling another caller's shared fetch.
There is no persistent catalog or database.

## Verification

```bash
npm run test:live:mcp -- --image=olx-mcp:local
npm run test:live:mcp -- --image=olx-mcp:local olx.kz olx.uz
```

The check connects through a real MCP client, looks up a city, searches with its
canonical value, retrieves details, and requests a second page when available.
If lookup fails, it also attempts countrywide search to distinguish lookup from
listing failures. Any failed required operation gives a nonzero exit status.
Only verification summaries are printed; listing and seller contents are not
stored as fixtures.

Live Docker MCP checks on 2026-10-01:

| Domain       | Location lookup                                       | Search, details and pagination                                            |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `olx.kz`     | Passed for Алматы (`alma-ata`)                        | Passed with the returned location                                         |
| `olx.uz`     | Passed for Ташкент (`tashkent`)                       | Passed with server-rendered search pages                                  |
| `olx.pl`     | Outside this lookup tool's scope                      | Search passed; detail passed earlier but a repeat missed its title marker |
| `olx.pt`     | Outside this lookup tool's scope                      | Passed with server-rendered search pages                                  |
| `olx.com.br` | HTTP 403                                              | HTTP 403; selectors remain unverified live                                |
| `olx.co.id`  | Jakarta Selatan picker exceeded the provider deadline | Countrywide search, details and load-more pagination passed               |
| `olx.in`     | Aluva picker exceeded the provider deadline           | Countrywide and Mumbai search/details passed; pagination not verified     |

The runtime uses full Chromium with its new headless mode. The smaller headless
shell failed India and Indonesia navigation with HTTP/2 stream resets in this
environment. Portugal and Uzbekistan searches disable JavaScript to preserve
server-rendered cards when client-side chunks fail; detail and location pages
retain JavaScript. Indonesia retries an ignored load-more click once after a
bounded wait with no additional cards.

These checks sample particular queries, cities and first-page listings; they do
not verify every category, filter or locality. Complete India coverage remains
unestablished. Blocked pages, HTTP errors, absent recognizable result markers,
and TLS failures are failures, never successful empty searches.

## Primary references

- [Brazil categories and site navigation](https://www.olx.com.br/mapa-do-site)
- [Indonesia search and load-more behavior](https://www.olx.co.id/items/q-laptop)
- [Indonesia city directory](https://www.olx.co.id/sitemap/cities)
- [Kazakhstan search](https://www.olx.kz/list/q-laptop/)
- [Uzbekistan search](https://www.olx.uz/list/q-laptop/)
- [India city directory](https://www.olx.in/sitemap/cities)
