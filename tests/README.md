# Testing

## Commands

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm test`                 | Run every mocked test file                                 |
| `npm run test:watch`       | Run tests in watch mode                                    |
| `npm run test:coverage`    | Run the full suite and enforce coverage thresholds         |
| `npm run ci`               | Lint, formatting, type checking, coverage tests, and build |
| `npm run test:integration` | Build and run opt-in live searches and detail checks       |

Run a focused file by passing it to the normal test command:

```bash
npm test -- src/scrapers/olx/olx-india.scraper.test.ts
```

Tests use Vitest in a Node.js environment. The default suite globally mocks
Playwright and does not need installed browser binaries or network access.

## Organization

Tests sit beside source files under `src/`:

- `core/`: type helpers, registry behavior, server initialization, and MCP handlers.
- `tools/`: argument validation, scraper delegation, options, and error propagation.
- `scrapers/olx/`: scraper behavior, factory routing, location mapping, and DOM extractors.

Shared support lives in `tests/`:

- `setup.ts`: global test configuration and Playwright mocking.
- `mocks/playwright.mock.ts`: browser/page mocks and search/detail scenarios.
- `mocks/mcp.mock.ts`: protocol and abort-signal helpers.
- `utils/test-helpers.ts`: data factories, assertions, and mock interfaces.

## Coverage

The coverage configuration requires 80% for statements, branches, functions, and
lines. Reports are written to `coverage/` in text, JSON, HTML, and LCOV formats.
The entry point, test files, and test helpers are excluded from measured production
coverage. All test files run in CI; there is no separate suite that skips known failures.

## Writing useful tests

Test observable behavior and failure paths. Changes to scraping should cover
empty results, malformed cards, changed selectors, retries, and page cleanup
when relevant. Changes to tool options should verify both returned fields and
whether optional browser work was skipped.

A page evaluation mock should return the callback's result, not its input DOM
nodes. Search extraction returns card objects; fallback URL lookup returns a
single string; gallery extraction returns URL strings. Mock these distinctly.

DOM extractors are serialized into the browser, so keep them self-contained.
Their fixture tests model markup shape but are not a browser integration test.

## Live checks

`integration-test.js` runs outside Vitest against real Chromium and OLX sites.
By default it checks Portugal, Poland, and India; pass domain arguments to select
other configured sites:

```bash
npm run test:integration -- olx.in
```

Install Chromium first. Live failures can result from unavailable sites, stale
selectors, empty searches, changed listing availability, or anti-bot checks.
The script exits unsuccessfully when a checked operation fails. It does not run
in CI and does not establish that all six sites work.

Report live checks separately from mocked test results. Do not record real seller
contact details, credentials, or private browsing data in test fixtures.

## Docker checks

Build the image with `docker build -t olx-mcp:local .`, then run
`npm run test:docker`. These checks launch real Chromium and connect to the
container's stdio MCP server with network access disabled. They are separate
from the mocked suite and live OLX checks. See [Docker](../docs/docker.md).

## MCP live verification

```bash
npm run test:live:mcp -- --image=olx-mcp:local
```

This opt-in command tests the Docker stdio server through the MCP SDK client.
Its default matrix covers India, Brazil, Indonesia, Kazakhstan, Uzbekistan,
Portugal, and Poland. It verifies location lookup where implemented, search,
details, and a second page where available. Pass domain arguments to narrow
the matrix; omit `--image` to run the compiled source server. Failed domain
checks produce a nonzero exit code. It does not store seller or listing contents.

Mocked location-provider tests exercise canonical-value handling and resource
lifecycle; they do not establish that the live picker matches those selectors.
Registry timing checks measure registry operations, with assertion work outside
the measured interval.
