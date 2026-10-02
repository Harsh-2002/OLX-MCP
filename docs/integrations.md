# Client integrations

Install Docker and pull `ghcr.io/harsh-2002/olx-mcp:latest` before connecting.
The image serves stdio MCP and requires protocol **2026-07-28**. It has no HTTP
endpoint. Client registration alone does not verify a connection; use the
client's MCP status or probe command before asking it to search.

[The README](../README.md#connect-your-client) contains the shortest setup recipes.
Commands use POSIX shell syntax. On PowerShell, set the corresponding environment
variables with `$env:NAME = "value"` before starting the client.

## Codex

The installed Codex CLI 0.159.3 exposes the `mcp_2026_07_28` feature flag. Enable
it when starting Codex, as shown in the README. To persist the setting instead:

```bash
codex features enable mcp_2026_07_28
```

For slow searches, set `tool_timeout_sec = 180` under `[mcp_servers.olx]` in
`~/.codex/config.toml`. The CLI, app, and IDE extension share this configuration
on the same host. `codex mcp list` shows registered servers; check `/mcp` in a
running session for availability. Releases without the modern feature need an
upgrade.

[Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
The feature flag and registration syntax were checked against the local CLI;
this documentation change does not claim an end-to-end Codex agent test.

## Claude Code

Use the v2 MCP runtime and enable modern negotiation for stdio servers:

```bash
MCP_SDK_GENERATION=v2 MCP_PROTOCOL_NEGOTIATION=auto claude
```

A current release is recommended; v2 runtime selection is available in the
versions described in [Anthropic's MCP client runtime documentation](https://code.claude.com/docs/en/mcp#mcp-client-runtimes).
After registration, start a fresh session and use `/mcp` to verify the connection.
For slow calls, set `MCP_TOOL_TIMEOUT=180000` in the client environment, or use
its per-server `timeout` setting. These are client settings, not environment
variables inside the Docker container.

## OpenCode

Use OpenCode v2's `mcp.servers` configuration and set `protocol` to
`"2026-07-28"`. Its default is a legacy handshake, which this server rejects.
Merge the README's `olx` entry into your existing config rather than replacing
other servers. The global configuration is `~/.config/opencode/opencode.json`.
Run `opencode mcp list` to check connectivity.

[Official OpenCode MCP configuration and protocol settings](https://opencode.ai/v2/docs/mcp-servers).

## Hermes

Current Hermes uses `protocol: auto` by default, trying modern discovery when a
server rejects its initial legacy handshake. The README's CLI installer probes
the server before saving it. To start with modern discovery directly, merge this
entry into `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  olx:
    command: docker
    args: [run, --rm, -i, --shm-size=256m, ghcr.io/harsh-2002/olx-mcp:latest]
    protocol: stateless
    timeout: 180
    connect_timeout: 60
```

Run `hermes mcp test olx`, then start a new chat or use `/reload-mcp`. Hermes has
been tested with modern discovery, listing searches, native photo attachments,
and client-side vision analysis; see [protocol verification](mcp-protocol.md#verification).

[Official Hermes MCP configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference/).

## OpenClaw

The README's commands use OpenClaw's built-in MCP registry. Docker must be
available to the Gateway or runtime that owns the connection. Run
`openclaw mcp doctor olx --probe` after registration.

The selected runtime must support MCP 2026-07-28. The reviewed OpenClaw registry
documentation does not establish that every runtime negotiates this revision,
and OpenClaw has not been tested end to end with this server. If the probe reports
Unsupported Protocol Version, upgrade or select a modern-capable runtime; saving
the registration does not fix protocol incompatibility.

[Official OpenClaw connection guide](https://docs.openclaw.ai/tools/mcp) and
[MCP registry reference](https://docs.openclaw.ai/cli/mcp/registry).

## Other clients

For clients using `mcpServers` JSON, merge this entry into their MCP configuration:

```json
{
  "mcpServers": {
    "olx": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--shm-size=256m", "ghcr.io/harsh-2002/olx-mcp:latest"]
    }
  }
}
```

Cursor commonly uses `.cursor/mcp.json` in a project or `~/.cursor/mcp.json`
globally. Claude Desktop uses its desktop MCP configuration. Both require a
release supporting this server's protocol; these paths and the JSON shape alone
are not a compatibility guarantee.

For VS Code's `.vscode/mcp.json`, use `servers` instead of `mcpServers` and add
`"type": "stdio"` to the server entry. Check that the installed MCP host supports
2026-07-28 before using it. Photo display and vision analysis depend on the client
and selected model.

See the [official OpenAI client configuration examples](https://developers.openai.com/learn/docs-mcp)
for Cursor and VS Code configuration shapes. The examples there demonstrate
registration; they do not establish compatibility with this server's protocol.

## Source installation

For development without Docker:

```bash
git clone https://github.com/Harsh-2002/OLX-MCP.git
cd OLX-MCP
npm ci
npx playwright install --with-deps chromium
npm run build
```

Use `node /absolute/path/to/OLX-MCP/dist/index.js` as the stdio command instead
of Docker. The same protocol requirements apply.
