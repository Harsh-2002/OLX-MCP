# Repository instructions

## Start here

Read `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`, and `tests/README.md`.
Check `git status` before editing and preserve unrelated user changes.
This is an independent repository maintained at `Harsh-2002/OLX-MCP`.

## Architecture

- `src/index.ts`: entry point, stdio transport, startup, and shutdown.
- `src/core/`: MCP handlers, tool registry, and shared data contracts.
- `src/tools/`: validated tool adapters; scraping belongs in the scraper layer.
- `src/validation/`: Zod argument schemas and currently unused output/discovery schemas.
- `src/scrapers/base/`: page lifecycle and retry handling.
- `src/scrapers/olx/`: shared search/detail extraction, domain configuration, and India overrides.
- `tests/`: shared mocks and helpers; most tests sit beside their source files.

Keep domain-specific selectors and URL patterns in `domain-config.ts`.
Use scraper overrides only for behavior configuration cannot express.
Functions evaluated in the browser must be self-contained; imports and module
closures are unavailable in the page execution context.

## Working rules

- Use TypeScript and the existing ESM import conventions, including `.js` import suffixes.
- Keep MCP traffic on stdout and operational logs on stderr.
- Validate tool arguments at the boundary and preserve the `Result` contract internally.
- Close browser pages on success and failure; keep caches bounded.
- Use plain text without emojis in code, logs, commits, and documentation.
- Do not claim implemented support for fields or tools that only exist as types or schemas.
- Never store secrets or personal browsing data in the repository.
- Preserve the required MIT notices. Current project metadata uses this repository's identity.
- Do not publish packages, push tags, or rewrite shared history without explicit user authorization.

## Validation

Run `npm run ci` after material changes. Use `npm run format` for formatting.
Run focused tests while developing, then run the full suite before completion.
Mocked tests need no browser installation. Live checks use
`npm run test:integration` after installing Chromium and must be reported separately.
Do not exclude failing tests to make CI pass or lower coverage thresholds to hide gaps.

## Documentation lookup

For library-specific API usage, setup, migration, or debugging, use Context7:
resolve with `npx ctx7@latest library <official-name> "<specific query>"`, then fetch
with `npx ctx7@latest docs <resolved-id> "<specific query>"`. Use at most three
commands per question. Do not send secrets in queries. General code review and
repository-only refactoring do not require library documentation lookup.

## Completion

Explain what changed, how it was verified, and any unresolved risks or limitations.
Update docs when behavior or operational procedures change.
