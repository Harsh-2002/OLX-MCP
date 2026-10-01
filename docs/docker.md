# Docker

## Build

```bash
docker build -t olx-mcp:local .
```

The multistage Dockerfile builds with official Node.js 24 on Debian Bookworm
and runs on Debian Bookworm slim. Both base images are pinned by digest. Only
the Node.js executable is copied into the runtime; npm and build tools stay in
the build stages. Build dependencies and TypeScript source stay in the build
stage. The runtime contains compiled code, production dependencies, Chromium's
headless shell, its system libraries, and Tini for signal forwarding and child
process reaping. It runs as a non-root `node` user (UID 1000).

The browser is installed through the lockfile's Playwright package, so its version
matches the application. Firefox, WebKit, and the full headed Chromium browser
are not installed. System libraries are installed explicitly, avoiding Xvfb and
Mesa drivers needed by headed browsers. Latin and Noto core fonts remain for
text rendering, including Indian scripts. Local dependencies, Git metadata, credentials, assistant
settings, and tests are excluded from the build context.

## Run

This image serves MCP over standard input/output. Run it with stdin attached:

```bash
docker run --rm -i --shm-size=256m olx-mcp:local
```

Do not allocate a TTY for an MCP connection. There is no HTTP endpoint or port
mapping in this image.

MCP client configuration:

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--shm-size=256m", "olx-mcp:local"]
    }
  }
}
```

The MCP client launches the container and owns its lifetime. Listing URL caches
are in memory, so use search and details within the same connection.

For a read-only container, add a writable temporary filesystem:

```bash
docker run --rm -i --read-only --tmpfs /tmp:rw,nosuid,size=256m olx-mcp:local
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
and development dependencies, the MCP handshake, tool discovery, and invalid
argument handling. Its containers use a read-only filesystem and have networking
disabled. It does not query live OLX pages.

To check a different local image:

```bash
npm run test:docker -- olx-mcp:custom
```

CI builds the image and runs these checks without publishing it.

## Updating the base image

Keep `NODE_IMAGE` and `RUNTIME_IMAGE` pinned to reviewed official Node.js 24
Bookworm slim and Debian Bookworm slim digests. Update both for Node.js and
operating-system updates. Rebuild after changing the lockfile so the bundled browser matches
Playwright. Run `npm run ci` and the Docker checks before merging.

The base image can be overridden for local evaluation:

```bash
docker build --build-arg NODE_IMAGE=node:24-bookworm-slim -t olx-mcp:custom .
```

The current image supports the application's headless launch behavior. If a future
change enables headed browsing or a browser channel, update the browser installation
step and tests accordingly.

## Image size

On linux/amd64, the optimized image reports approximately 847 MB through
`docker image inspect`, compared with approximately 1.23 GB before optimization
(about 31% smaller). This is the local Docker size metric, not a registry download
size. Layer history totals approximately 620 MB uncompressed; reported storage
can also include compressed layers depending on the Docker image store.
