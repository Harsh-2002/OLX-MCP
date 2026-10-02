# OLX MCP: instructions for coding agents

These instructions apply throughout this repository. Keep shared agent guidance
in this file. Explicit task instructions take precedence over repository defaults.

## Project and orientation

OLX MCP is a TypeScript ESM stdio server using MCP SDK v2, Playwright Chromium,
and Zod v4. It searches nine OLX country sites and returns listing data and native
photo attachments. It has no HTTP endpoint or persistent listing store.
Repository: `Harsh-2002/OLX-MCP`.

Before editing, check `git status --short` and preserve unrelated changes.
Read `README.md` and `CONTRIBUTING.md`. For implementation work, read
`docs/architecture.md` and `tests/README.md`, then inspect the affected source
and adjacent tests. Use `docs/countries.md` for country-specific limitations and
`docs/mcp-protocol.md` for protocol changes.

## Setup and commands

Run commands from the repository root. Use npm and the committed lockfile.
Node.js 22 or newer is required; `.nvmrc` selects Node.js 24.

| Command                               | Purpose                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `npm ci`                              | Install the locked dependencies                                 |
| `npm run dev`                         | Run the source stdio server; it waits for a client              |
| `npm run build`                       | Compile TypeScript to `dist/`                                   |
| `npm test -- src/core/server.test.ts` | Run a focused test file                                         |
| `npm run format`                      | Apply repository formatting                                     |
| `npm run ci`                          | Lint, formatting checks, type checks, coverage tests, and build |

Mocked unit and protocol tests need no browser installation or network access.
For live checks, install Chromium with
`npx playwright install --with-deps chromium`, then use:

- `npm run test:integration -- olx.in` for direct scraper checks.
- `npm run test:live:mcp -- --images olx.in` for the real source MCP server,
  including photo bytes.
- `npm run test:live:mcp -- --image=olx-mcp:local --images olx.in` for a built image.

For Docker changes, build `docker build -t olx-mcp:local .` and run
`npm run test:docker -- olx-mcp:local`. This checks real Chromium and MCP against
offline fixtures. It is separate from live website checks.

## Where changes belong

- `src/index.ts`: executable flags, stdio startup, and shutdown.
- `src/core/server.ts`: browser ownership, MCP discovery, tool calls, and logs.
- `src/core/tool-output.ts`: advertised output schemas and response validation.
- `src/core/browser-pages.ts`: page admission, cancellation, and cleanup.
- `src/core/domains.ts`: supported domain and location-domain lists.
- `src/tools/`: validated tool adapters; scraping belongs in the scraper layer.
- `src/validation/`: argument schemas and additional unused discovery schemas.
- `src/scrapers/base/`: shared page lifecycle and retries.
- `src/scrapers/olx/`: shared extraction, country configuration, and overrides.
- `src/locations/`: native HTTP/2 and browser lookup with bounded caching.
- `src/images/`: validated image downloads and bounded concurrency.
- `tests/`: shared mocks and helpers; most tests sit beside their source files.

Keep country selectors and URL patterns in `src/scrapers/olx/domain-config.ts`.
Use overrides only for behavior configuration cannot express. Browser-evaluated
functions must be self-contained: imports and module closures are unavailable
inside the page. Update domain lists, schemas, tests, and country docs together
when adding or removing a country.

## Implementation rules

- Use TypeScript, strict types, and ESM imports with `.js` suffixes.
- Keep MCP responses on stdout and operational logs on stderr. Log summaries,
  never private arguments, listing contents, seller data, URLs, or image bytes.
- Validate arguments at tool boundaries, preserve the internal `Result` contract,
  and validate successful output against the advertised schemas.
- Preserve the modern stdio protocol contract. Do not add a legacy handshake
  fallback or describe registration as proof of client compatibility.
- Close pages, network sessions, and downloads on success, failure, and
  cancellation. Preserve bounded queues, caches, and shared admission controls.
- Preserve SSR extraction with JavaScript disabled where configured. India and
  Indonesia need JavaScript for load-more navigation; a count alone does not
  prove listing cards are ready.
- Preserve image host, DNS, redirect, MIME, and byte-limit checks. Photos are
  delivered as native MCP image blocks; vision analysis belongs to the client.
- Use plain text without emojis in code, logs, commits, and documentation,
  except the supported-country flags in the README.
- Do not claim support for fields or tools that exist only as types or schemas.
- Do not commit secrets, browsing data, generated build output, or local client
  configuration. Preserve required MIT copyright and permission notices.

## Validation and delivery

Run focused tests during implementation and `npm run ci` after material changes,
before committing the final result. Add regression tests for changed behavior
and failure paths. Do not exclude failing tests or lower coverage thresholds.
Report mocked, offline Docker, and live checks separately; tests with mocks do
not establish that current OLX selectors work. Report initial live failures and
retries honestly, including anything not tested.

Work on a focused branch and submit a pull request. Never push directly to
`main`. Merge only when requested and after required checks pass. Use the PR
template to describe the resulting behavior, validation, and remaining limits.
Keep the README short; put detailed usage and operations in the relevant docs.

Docker publishing is manual through `.github/workflows/publish-docker.yml`.
The GHCR image uses only `latest`, with AMD64 and ARM64 in one manifest.
Do not publish images or npm packages, create releases or tags, rewrite shared
history, or change running client deployments unless the task authorizes it.
CI validates pull requests and pushes to `main`; it does not publish images.

## Current documentation

For library-specific APIs, setup, migration, or debugging, use Context7:
resolve with `npx ctx7@latest library <official-name> "<specific query>"`, then
fetch with `npx ctx7@latest docs <resolved-id> "<specific query>"`.
Use at most three commands per question and never send secrets in queries.
If lookup is unavailable, state that limitation and use official documentation.
Repository-only refactoring and general code review do not require this lookup.

Keep this file aligned with `package.json`, the source, and CI. Link to detailed
docs rather than duplicating their full contents. In the final response, explain
what changed, what was verified, and any unresolved limitations.
