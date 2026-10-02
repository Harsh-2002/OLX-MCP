# MCP protocol requirements

OLX MCP uses the official TypeScript server SDK v2.2.0 and supports only protocol
revision **2026-07-28**. The monolithic v1 SDK and `zod-to-json-schema` dependency
have been removed. Zod v4 provides validation and JSON Schema generation.

## Client connection

Clients must support modern discovery and per-request protocol metadata.
The server uses `serveStdio` with `legacy: 'reject'`. An older `initialize`
request receives Unsupported Protocol Version (`-32022`) naming the supported
revision. There is no server-side fallback to earlier revisions.

For a TypeScript SDK v2 client:

```typescript
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client(
  { name: 'olx-client', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } }
);
await client.connect(
  new StdioClientTransport({
    command: 'docker',
    args: [
      'run',
      '--log-opt',
      'max-size=10m',
      '--log-opt',
      'max-file=3',
      '--rm',
      '-i',
      '--shm-size=256m',
      'olx-mcp:local',
    ],
  })
);
```

The installed Hermes bridge supports modern discovery through its Python MCP
v2 client. Its `olx` server configuration uses `protocol: stateless`. Clients
supporting only earlier revisions must be upgraded before connecting.

## Tool results

All four tools advertise input and output schemas. Successful results contain
validated `structuredContent` and JSON text for model-readable metadata. Photos
also contain native MCP image blocks. Image base64 is absent from structured
metadata and text. Internal listing dates are serialized as ISO strings.

Validation, scraping and download failures use `isError: true` with explanatory
text. Unknown tools use Invalid Params (`-32602`) protocol errors. Invalid server
output is rejected rather than returned as successful data.

The SDK owns discovery, required wire result fields and protocol metadata.
The tool catalog and discovery responses advertise five-minute public cache
hints. Listing contents are not given these cache hints. The server retains
existing browser and image concurrency bounds and forwards the v2 request's
cancellation signal to tools.

Chromium starts only after a valid modern opening. Legacy-rejected and unopened
connections can exit on stdin EOF without starting Chromium. Active connections
close browser resources on transport shutdown or process signals.

## Verification

```bash
npm run ci
docker build -t olx-mcp:local .
npm run test:docker
npm run test:live:mcp -- --image=olx-mcp:local --images
```

Protocol tests use a real child process and SDK v2 client. They cover modern
discovery, structured search results, image blocks, tool errors, cancellation and
legacy rejection. Offline Docker checks also exercise the actual CLI's legacy
rejection and EOF exit, real Chromium and native image delivery.

Live checks must be reported separately from mocked and offline checks. Upstream
availability and client attachment support remain independent of the protocol
revision. This migration retains stdio transport; it adds no public HTTP endpoint.

On 2026-10-02, full CI passed 416 tests, including the real stdio protocol tests.
Offline Docker checks passed. A pinned modern client passed sampled search,
details and photo delivery across all nine supported countries, with location
lookup on the four supported location domains and pagination where available.
Hermes connected through modern discovery, received a listing photo attachment,
and successfully called `vision_analyze` on that photo. These are sampled live
results, not guarantees for every listing or client.

## Official references

- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [Protocol revision migration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)
- [SDK v1 to v2 migration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md)
