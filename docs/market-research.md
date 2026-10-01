# OLX market research

Research date: 2026-10-01. Pakistan and Bangladesh are excluded from the planned
scope. Adapters are implemented for these priorities; live verification status is tracked in [Countries](countries.md).

Improve India location discovery first. The current India adapter accepts
mapped cities and canonical location slugs; live lookup is now exposed through `searchLocations`, but
complete locality coverage depends on the public native autocomplete data. Numeric-ID search routes were verified using Aluva and Surabaya; the runtime no longer depends on selecting each suggestion in the browser. OLX publishes [city](https://www.olx.in/sitemap/cities) and
[region](https://www.olx.in/sitemap/regions) directories. A location lookup tool
should return canonical identifiers and state information, handle duplicate city
names, and support the locations OLX actually serves rather than inventing URLs.

## Candidate markets

| Priority for new adapters | Market     | Evidence                                                                                                                                                                                                                                             |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                         | Brazil     | OLX reports more than 60 million monthly users across its Brazilian group platforms, including OLX, ZAP, and Viva Real. This is a group figure, not OLX alone. [Official overview](https://form-ajuda.olx.com.br/s/article/quem-somos)               |
| 2                         | Indonesia  | Astra reported more than 8.5 million monthly active users of OLX.co.id on 2025-05-06. [Official announcement](https://www.astra.co.id/en/press-release/astra-and-toyota-strengthen-strategic-partnership-in-used-car-business)                       |
| 3                         | Kazakhstan | OLX reported about 10 million monthly active users and 3.6 million listings as of 2025-06-30. [Official announcement](https://www.olxgroup.com/news/veons-beeline-kazakhstan-to-acquire-online-classifieds-platform-olx-kazakhstan/)                 |
| 4                         | Uzbekistan | OLX reported 5.4 million monthly active users and 2.2 million active listings in its 2025-08-21 sale announcement. [Official announcement](https://www.olxgroup.com/news/olx-group-to-sell-olx-uzbekistan-to-a-joint-venture-led-by-tbc-bank-group/) |

Figures use different dates and definitions and do not establish an exact global
traffic ranking. Priorities combine audience scale and usefulness of broader
coverage. OLX Group ownership does not imply that a country has an OLX-branded
classifieds site: other group brands need separate evaluation.

Before adding a market, verify its current site, location identifiers, category
and currency handling, selectors, and search/detail behavior through a real MCP
client. Similar branding does not guarantee shared HTML or URL patterns.
