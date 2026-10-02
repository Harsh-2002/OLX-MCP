# Docker

## Pull the published image

```bash
docker pull ghcr.io/harsh-2002/olx-mcp:latest
docker run --rm ghcr.io/harsh-2002/olx-mcp:latest --version
```

The public image includes Chromium and its system libraries. The single `latest`
manifest contains `linux/amd64` and `linux/arm64` images. Docker selects your
machine's architecture automatically, including Apple Silicon and ARM64 Linux
hosts. Pull it again and restart the MCP client to update.

## Build locally

```bash
docker build -t olx-mcp:local .
```

The multistage Dockerfile builds with official Node.js 24 on Debian Bookworm
and runs on Debian Bookworm slim. Both base images are pinned by digest. Only
the Node.js executable is copied into the runtime; npm and build tools stay in
the build stages. Build dependencies and TypeScript source stay in the build
stage. The runtime contains compiled code, production dependencies, full Chromium in its new headless mode, its system libraries, and Tini for signal forwarding and child
process reaping. It runs as a non-root `node` user (UID 1000). Chromium config
and cache directories use `/tmp` so its crash-handler initialization also works
with a read-only root filesystem.

The browser is installed through the lockfile's Playwright package, so its version
matches the application. The server selects Playwright's `chromium` channel.
Firefox, WebKit, and the separate headless shell are not installed. System libraries are installed explicitly, avoiding Xvfb and
Mesa drivers needed by headed browsers. Latin and Noto core fonts remain for
text rendering, including Indian scripts. Local dependencies, Git metadata, credentials, assistant
settings, and tests are excluded from the build context.

## Run

This image serves MCP 2026-07-28 over standard input/output. Older protocol
clients are rejected. Run it with stdin attached:

```bash
docker run --rm -i --shm-size=256m ghcr.io/harsh-2002/olx-mcp:latest
```

Do not allocate a TTY for an MCP connection. There is no HTTP endpoint or port
mapping in this image.

MCP client configuration:

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--shm-size=256m",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,size=256m",
        "ghcr.io/harsh-2002/olx-mcp:latest"
      ]
    }
  }
}
```

The MCP client launches the container and owns its lifetime. Listing URL caches
are in memory, so use search and details within the same connection.

For a read-only container, add a writable temporary filesystem:

```bash
docker run --rm -i --shm-size=256m --read-only --tmpfs /tmp:rw,nosuid,size=256m ghcr.io/harsh-2002/olx-mcp:latest
```

Normal scraping requires outbound network access. No host directories or Docker
socket need to be mounted into the container. The application currently launches
Chromium with its existing sandbox-disabled flags; running as a non-root user
does not change those flags.

## Verify

```bash
docker run --rm olx-mcp:local --version
docker run --rm olx-mcp:local --help
npm run test:docker
```

`test:docker` checks real Chromium startup, non-root execution, absence of source
and development dependencies, modern MCP discovery, tool output schemas, native image-block delivery with an offline fixture, and invalid
argument handling. Its containers use a read-only filesystem and have networking
disabled. It does not query live OLX pages.

To check a different local image:

```bash
npm run test:docker -- olx-mcp:custom
```

CI builds the image and runs these checks without publishing it. To verify the
published image instead, run:

```bash
npm run test:docker -- ghcr.io/harsh-2002/olx-mcp:latest
```

## Updating the base image

Keep `NODE_IMAGE` and `RUNTIME_IMAGE` pinned to reviewed official Node.js 24
Bookworm slim and Debian Bookworm slim digests. Update both for Node.js and
operating-system updates. Rebuild after changing the lockfile so the bundled browser matches
Playwright. Run `npm run ci` and the Docker checks before merging.

The base image can be overridden for local evaluation:

```bash
docker build --build-arg NODE_IMAGE=node:24-bookworm-slim -t olx-mcp:custom .
```

The current image supports full Chromium in headless mode. Headed browsing still
requires an external display and additional desktop configuration.

## Image size

Full Chromium replaces the smaller headless-shell build because live India and
Indonesia requests failed with the shell and succeeded with full Chromium.
The first published GHCR build on 2026-10-02 targets `linux/amd64` and reports
1,032,703,476 bytes (approximately 1.03 GB) through `docker image inspect`.
Its registry manifest contains 305,053,413 bytes of compressed layers
(approximately 305 MB) for a fresh pull. Existing cached layers reduce downloads.

An earlier local full-Chromium build reported 1,060,945,919 bytes; that is the
build measured in [the benchmark report](benchmarks.md). The previous shell
image was approximately 847 MB. Sizes vary with installed system packages;
local image size and compressed registry download size measure different things.

## Performance and photo checks

```bash
npm run test:live:mcp -- --image=olx-mcp:local --images
```

`--images` additionally downloads one photo per sampled listing and checks native
MCP image blocks, MIME type, source metadata and the byte cap. It retains only
verification summaries. Browser concurrency is limited to four pages per server;
image-download concurrency is limited to two. These limits apply within one
process, not across independently launched containers.

A controlled resource check runs without outbound networking:

```bash
node scripts/measure-resources.mjs olx-mcp:local
```

The 2026-10-02 fixture served two photos totaling 1,048,712 bytes before filtering.
SSR filtering reduced photo requests from two to zero and downloaded photo bytes
from 1,048,712 to zero, while preserving both source URLs. Timing is printed for
diagnostics, but this small local fixture does not establish an overall live-site
speedup. Country-specific navigation, hydration and upstream latency still apply.

## Modern clients

The server supports only MCP 2026-07-28. For SDK v2 clients, explicitly pin modern
negotiation with `versionNegotiation: { mode: { pin: '2026-07-28' } }`.
For the installed Hermes integration, set `protocol: stateless` on its `olx` MCP
configuration to start with `server/discover`. The server rejects any attempted
legacy initialization. See [protocol migration](mcp-protocol.md).

The resource measurement defaults to ten pairs after a warmup, with alternating
order and equal page lifecycle timing. Pass a third argument to change the pair
count. See [benchmarks](benchmarks.md) for previous/current image comparisons, raw
samples and the limits of the timing claims.

## Publishing to GHCR

Run the **Publish Docker image** workflow from the repository's Actions tab,
selecting `main`. Publishing is manual and does not create an npm package, Git
tag, or GitHub release. Native Ubuntu 24.04 runners for AMD64 and ARM64 each run
`npm run ci`, build the runtime image, and run offline real-Chromium/MCP checks.
Each platform is pushed by digest using the repository's `GITHUB_TOKEN`, with no
architecture tags. The workflow compares the pushed image configuration against
the tested build, pulls that digest, and reruns Docker checks on the native host.

Only after both platform jobs pass does the final job publish `latest` as a
multi-platform manifest. It verifies that the manifest contains exactly the two
tested platform digests and that `latest` is the only tag. If either native build
or test fails, the existing `latest` manifest remains unchanged. The image labels
record the source commit, and the run summary records the platform digests.

Inspect the published platforms:

```bash
docker buildx imagetools inspect ghcr.io/harsh-2002/olx-mcp:latest
```

On the first publication, GitHub creates the package with private visibility.
Open [the package settings](https://github.com/users/Harsh-2002/packages/container/olx-mcp/settings)
and change its visibility to **Public** so users can pull it without credentials.
The image's source label and workflow associate it with this repository.

Verify anonymous access with an empty Docker configuration:

```bash
image_config=$(mktemp -d)
docker --config "$image_config" pull ghcr.io/harsh-2002/olx-mcp:latest
rm -rf "$image_config"
```

For live OLX checks against the published image:

```bash
npm run test:live:mcp -- --image=ghcr.io/harsh-2002/olx-mcp:latest --images
```

Live checks depend on OLX availability and are reported separately from the
offline checks in the publishing workflow.
