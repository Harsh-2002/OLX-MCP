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

## Docker publishing

Docker images are distributed through `ghcr.io/harsh-2002/olx-mcp`. npm publishing
is not part of the current distribution workflow.

Maintainers run the **Publish Docker image** workflow manually from `main` after
reviewing the changes. It runs full CI, builds a `linux/amd64` image, and tests
real Chromium and MCP behavior before pushing that exact image to GHCR. It uses
the repository's `GITHUB_TOKEN` with `packages: write`; no npm or registry token
secret is needed. No Git tag or GitHub release is created.

Each successful publication updates `latest` and adds `sha-<full-commit>` for
source identification. Pin an image digest when exact build reproducibility is
required. Package visibility must be **Public** for anonymous pulls. See
[Docker publishing](docs/docker.md#publishing-to-ghcr) for the first-publication
steps and verification commands.

CI on `main` and pull requests runs the full validation suite on Node.js 22 and 24.
Live website tests remain opt-in because they depend on external sites.

## Licensing

Contributions are provided under the repository's MIT license. Preserve the
existing copyright and permission notices when distributing inherited code.
