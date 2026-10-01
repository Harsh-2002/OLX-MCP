# Contributing

## Setup

Use Node.js 22 or newer. `.nvmrc` selects Node.js 24.

```bash
npm ci
npm run ci
```

Mocked tests do not require a browser. For live scraping, install Chromium with
`npx playwright install chromium` and any required system libraries.

Read [Architecture](docs/architecture.md) before changing module boundaries, and
[Testing](tests/README.md) before changing browser mocks.

## Making changes

1. Create a focused branch from `main`.
2. Keep changes scoped to the issue being addressed.
3. Add regression coverage for behavior changes, including failure paths.
4. Update documentation when tool inputs, outputs, setup, or behavior change.
5. Run `npm run ci` before opening a pull request.

Use `npm run format` to apply formatting. Commit source and the lockfile when
changing dependencies. Do not commit build output, browser artifacts, credentials,
or local assistant settings.

Use clear commit subjects describing the change. Pull requests should explain
the problem, resulting behavior, validation performed, and any remaining limits.
AI-assisted contributions follow the same review and validation requirements.

## Reporting bugs

Include the country domain, sanitized tool arguments, expected and actual
behavior, relevant error output, Node.js version, and whether the issue reproduces
with a fresh browser installation. Never include credentials or private seller data.

Website selectors are external dependencies. A mocked test passing is not evidence
that the selector still matches the live site. Describe any live check separately.

## Releases

The package name is `@harsh-2002/olx-mcp`, and the executable remains
`olx-mcp`. Releases require publish access to that npm scope and an `NPM_TOKEN`
repository secret. Setting up those credentials is a maintainer responsibility.

Before releasing:

1. Run `npm ci` and `npm run ci`.
2. Review `npm pack --dry-run` for the intended package contents.
3. Check that README setup instructions and documented limitations are current.
4. Update the version with `npm version patch`, `minor`, or `major` as appropriate.
5. Push the version commit and matching `v*` tag once the release is approved.

The tag workflow validates the full project, packs it, checks the packaged
executable, publishes that archive, and creates a GitHub release. Do not publish
locally in parallel with the workflow. Tag and package versions must match.

CI on `main` and pull requests runs the full validation suite on Node.js 22 and 24.
Live website tests remain opt-in because they depend on external sites.

## Licensing

Contributions are provided under the repository's MIT license. Preserve the
existing copyright and permission notices when distributing inherited code.
