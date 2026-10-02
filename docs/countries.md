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

Additional native JSON checks covered Kerala, Kakkanad, Coimbatore, Surabaya and
Jawa Timur, including city, region and locality records. Kakkanad parent filtering
was also checked live. These are sampled lookups, not an exhaustive location catalog.

Native JSON requests have a 15-second absolute deadline and a 1 MiB response limit.
Browser picker requests have a 30-second deadline and may return only one match
when each further selection requires navigation. Successful queries are cached
for ten minutes, at most 200 entries per domain. Identical pending queries share
one fetch; cancelling one caller does not cancel another caller's shared fetch.
There is no persistent catalog or database.

## Verification

```bash
npm run test:live:mcp -- --image=olx-mcp:local
npm run test:live:mcp -- --image=olx-mcp:local olx.kz olx.uz
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

Live Docker MCP checks on 2026-10-01:

| Domain      | Location lookup                          | Search, details and pagination                                                   |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `olx.pt`    | Outside this lookup tool's scope         | Passed                                                                           |
| `olx.pl`    | Outside this lookup tool's scope         | Passed with server-rendered details                                              |
| `olx.bg`    | Outside this lookup tool's scope         | Passed                                                                           |
| `olx.ro`    | Outside this lookup tool's scope         | Passed                                                                           |
| `olx.ua`    | Outside this lookup tool's scope         | Passed                                                                           |
| `olx.kz`    | Passed for Алматы (`alma-ata`)           | Passed with the returned location                                                |
| `olx.uz`    | Passed for Ташкент (`tashkent`)          | Passed with server-rendered search                                               |
| `olx.co.id` | Passed for Jakarta Selatan (`_g4000030`) | Passed with the returned location and a distinct second batch                    |
| `olx.in`    | Passed for Aluva (`_g4395807`)           | Aluva and Mumbai search/details passed; distinct countrywide second batch passed |

The runtime uses full Chromium in new headless mode. The smaller headless shell
failed India and Indonesia navigation with HTTP/2 stream resets in this environment.
European and Central Asian search pages disable JavaScript and read the populated
server-rendered cards, avoiding dependencies on client chunks and hydration. Polish details disable JavaScript and select the title
heading separately from action controls. Other detail pages and browser pickers
retain JavaScript. India and Indonesia retry an ignored load-more click once after
a bounded wait without new cards. Navigation waits for DOM content, followed by
explicit readiness checks, rather than network idle.

During the post-removal matrix, one Portugal detail fetch lacked the expected
title marker. A separate Docker MCP recheck passed search, details and pagination;
the live checks therefore do not guarantee that every detail request succeeds.

These checks sample particular queries, cities and listings. They do not establish
exhaustive support for every category, filter or locality. Complete India coverage
remains unestablished. HTTP errors, blocked pages, TLS failures and absent recognized
result markers are failures, never successful empty searches.

## Photo delivery verification

On 2026-10-02, the Docker MCP client received actual photo blocks for sampled
listings in all nine countries. Each result included a supported MIME type,
nonempty decoded bytes within the 2 MiB limit, and a corresponding source URL.
India and Indonesia gallery readiness and Indonesia's direct image-node selector
were verified after correcting initial missing-photo failures. The final matrix
passed photo delivery on eight sites; Portugal returned a missing-title selector
error on the second detail-page request after its first detail request succeeded.
A separate Portugal recheck passed search, details, pagination and native photo
delivery. This intermittent page response
remains an upstream availability limitation.

Hermes's native MCP bridge also received a listing photo and created a local
attachment. A real Hermes `vision_analyze` call correctly described the visible
desktop setup. This verifies image reception and a vision path; delivery to each
messaging platform still depends on that client's attachment support. No message
to a seller or external recipient was sent as part of verification.

A listing may have no exposed photos, a CDN request may fail, or a photo may exceed
the download cap. Responsive sources are preferred when the browser exposes them;
returned resolution still depends on OLX. These sampled checks do not guarantee
photos for every listing or support for every client/model's image formats.

The subsequent MCP 2026-07-28 / SDK v2 migration was verified on 2026-10-02 with a
modern-only Docker client. All nine sampled country checks passed, including
search, details and native photo delivery. Live location lookup passed for India,
Indonesia, Kazakhstan and Uzbekistan; pagination was verified where available.
Hermes also received and analyzed a photo through the migrated connection.
See [protocol requirements](mcp-protocol.md).

## Primary references

- [Indonesia search and load-more behavior](https://www.olx.co.id/items/q-laptop)
- [Indonesia city directory](https://www.olx.co.id/sitemap/cities)
- [Kazakhstan search](https://www.olx.kz/list/q-laptop/)
- [Uzbekistan search](https://www.olx.uz/list/q-laptop/)
- [India city directory](https://www.olx.in/sitemap/cities)
