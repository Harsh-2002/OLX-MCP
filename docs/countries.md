# Country capabilities

The MCP schemas accept nine domains. All nine adapters passed sampled live MCP
checks in the verification environment. Live availability depends on the upstream
site and network; operation results are listed below.

| Country    | Domain      | Currency metadata | Search behavior                                                          |
| ---------- | ----------- | ----------------- | ------------------------------------------------------------------------ |
| Portugal   | `olx.pt`    | EUR               | European adapter with server-rendered search                             |
| Poland     | `olx.pl`    | PLN               | European adapter with server-rendered details                            |
| Bulgaria   | `olx.bg`    | EUR               | European configuration                                                   |
| Romania    | `olx.ro`    | RON               | European configuration                                                   |
| Ukraine    | `olx.ua`    | UAH               | European configuration                                                   |
| India      | `olx.in`    | INR               | Legacy cards, city aliases, live locations, load-more batches 1–10       |
| Indonesia  | `olx.co.id` | IDR               | Legacy cards, iid IDs, query, location and limit; load-more batches 1–10 |
| Kazakhstan | `olx.kz`    | KZT               | `/list/` routes, native category paths, Unicode queries                  |
| Uzbekistan | `olx.uz`    | UZS               | `/list/` routes, native category paths, Unicode queries                  |

Prices remain the site's displayed strings. Currency metadata does not convert
prices; Uzbekistan can display different currency units. Use native price-filter
units. Bulgaria metadata is EUR following its 2026 changeover; any dual-currency
price labels are preserved. [ECB reference](https://www.ecb.europa.eu/euro/changeover/bulgaria/html/index.en.html).

Pagination totals are estimates. In India and Indonesia, `page` selects a native
load-more batch. `limit` caps returned listings rather than defining batch size.
Batches may overlap if listings change between requests. India retains its
existing filters; Indonesia rejects unverified category, price and sort filters.
Kazakhstan and Uzbekistan category inputs are native paths, for example
`elektronika/kompyutery/noutbuki`.

## Location inputs

Use `searchLocations` for India, Indonesia, Kazakhstan and Uzbekistan.
India and Indonesia read the public native autocomplete endpoint over HTTP/2.
The returned numeric IDs form native `_g<ID>` search routes, verified with Aluva
and Surabaya. Names never become guessed slugs. Lookup no longer depends on
browser picker hydration or the limited city sitemap.

Kazakhstan and Uzbekistan use the public browser picker, accepting
canonical paths from native responses or location links. Kazakhstan and
Uzbekistan district suggestions need additional native filters and are omitted
rather than silently converted to city searches.

Output includes `id`, `name`, `type` and `searchValue`. Parent IDs and region names
appear only when OLX supplies them. Pass `searchValue` unchanged to listing search.
India and Indonesia return values such as `_g4395807` and `_g4000030`; existing
named routes such as `aluva_g4395807` remain accepted. Native picker slugs include
`alma-ata` for Алматы and `tashkent` for Ташкент.

India city aliases such as Mumbai remain supported. Additional friendly names
resolve live; unknown or ambiguous names require lookup and an explicit canonical
value. Public autocomplete determines discoverable localities. Country-level
suggestions are outside the region/city/district/locality output contract.

Location coverage depends on OLX's public autocomplete responses. Lookups are
bounded and cached in memory; there is no persistent location catalog or database.
See [architecture](architecture.md) for request limits and concurrency.

## Verification

```bash
npm run test:live:mcp -- --image=ghcr.io/harsh-2002/olx-mcp:latest
npm run test:live:mcp -- --image=ghcr.io/harsh-2002/olx-mcp:latest olx.kz olx.uz
```

The default matrix covers all nine countries through a real MCP client. It checks
location lookup where implemented, search with the returned value, listing
details and a second page where available. Add `--images` to verify native MCP
photo delivery for the sampled listings. India also checks countrywide
pagination and the Mumbai alias. Listing details and pagination are checked
independently so a detail failure does not hide pagination status. Failed lookup
also triggers countrywide search to distinguish lookup from listing failures.
Any required failure produces a nonzero exit status. Only operation status and
timing summaries are printed; listing and seller contents are not retained.

The MCP 2026-07-28 client checks on 2026-10-02 passed for sampled listings in
all nine countries: search, details and native photo delivery, plus pagination
where available. Live location lookup passed for India, Indonesia, Kazakhstan
and Uzbekistan. Hermes also received a listing photo and analyzed it through its
vision integration. See [protocol requirements](mcp-protocol.md).

These checks sample specific queries, cities and listings. They do not establish
support for every category, filter or locality; complete coverage of every Indian
city remains unverified. Portugal previously returned intermittent missing-title
responses, although subsequent checks passed. Live results depend on OLX and the
network. HTTP errors, blocked pages, TLS failures and missing recognized result
markers are reported as failures rather than successful empty searches.

Photo delivery depends on exposed image URLs, CDN availability and the download
cap. Client and model support determines whether received photos can be viewed,
analyzed or shared. See the [tool reference](tools.md) for photo limits.

## Primary references

- [Indonesia search and load-more behavior](https://www.olx.co.id/items/q-laptop)
- [Indonesia city directory](https://www.olx.co.id/sitemap/cities)
- [Kazakhstan search](https://www.olx.kz/list/q-laptop/)
- [Uzbekistan search](https://www.olx.uz/list/q-laptop/)
- [India city directory](https://www.olx.in/sitemap/cities)
