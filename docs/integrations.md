# Client integrations

Install Docker and pull `ghcr.io/harsh-2002/olx-mcp:latest` before connecting.
The image connects over stdio; let your client launch the Docker process.
Use the client's MCP status or probe command to check the connection before
asking it to search.

[The README](../README.md#connect-your-client) contains the shortest setup recipes.
Commands use POSIX shell syntax. On PowerShell, set the corresponding environment
variables with `$env:NAME = "value"` before starting the client.

## Codex

Use the registration and startup commands in the README. To persist the
startup setting instead:

```bash
codex features enable mcp_2026_07_28
```

For slow searches, set `tool_timeout_sec = 180` under `[mcp_servers.olx]` in
`~/.codex/config.toml`. The CLI, app, and IDE extension share this configuration
on the same host. `codex mcp list` shows registered servers; check `/mcp` in a
running session for availability.

[Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
The registration syntax and startup setting were checked against the local CLI.
The registration command includes the per-server environment setting needed by
that CLI; it configures Codex and does not change the Docker image.

## Claude Code

Use the v2 MCP runtime and enable modern negotiation for stdio servers:

```bash
MCP_SDK_GENERATION=v2 MCP_PROTOCOL_NEGOTIATION=auto claude
```

See [Claude Code runtime settings](https://code.claude.com/docs/en/mcp#mcp-client-runtimes).
After registration, start a fresh session and use `/mcp` to verify the connection.
For slow calls, set `MCP_TOOL_TIMEOUT=180000` in the client environment, or use
its per-server `timeout` setting. These are client settings, not environment
variables inside the Docker container.

## OpenCode

Use `mcp.servers` with `protocol: "auto"`, as shown in the README.
Automatic negotiation connects using the protocol offered by the server.
Merge the README's `olx` entry into your existing config rather than replacing
other servers. The global configuration is `~/.config/opencode/opencode.json`.
Run `opencode mcp list` to check connectivity, or use `/mcps` in a session.

[Official OpenCode MCP configuration and protocol settings](https://opencode.ai/v2/docs/mcp-servers).

## Hermes

The README's installer checks the connection before saving it. For manual setup,
merge this entry into `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  olx:
    command: docker
    args:
      [
        run,
        --log-opt,
        max-size=10m,
        --log-opt,
        max-file=3,
        --rm,
        -i,
        --shm-size=256m,
        ghcr.io/harsh-2002/olx-mcp:latest,
      ]
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

Check that the probe succeeds before starting a chat. If it reports a protocol
error, update the client or select a compatible runtime. OpenClaw has not been
tested end to end with this server.

[Official OpenClaw connection guide](https://docs.openclaw.ai/tools/mcp) and
[MCP registry reference](https://docs.openclaw.ai/cli/mcp/registry).

## Other clients

For clients using `mcpServers` JSON, merge this entry into their MCP configuration:

```json
{
  "mcpServers": {
    "olx": {
      "command": "docker",
      "args": [
        "run",
        "--log-opt",
        "max-size=10m",
        "--log-opt",
        "max-file=3",
        "--rm",
        "-i",
        "--shm-size=256m",
        "ghcr.io/harsh-2002/olx-mcp:latest"
      ]
    }
  }
}
```

Cursor commonly uses `.cursor/mcp.json` in a project or `~/.cursor/mcp.json`
globally. Claude Desktop uses its desktop MCP configuration. Restart the MCP
connection after saving the configuration.

VS Code also supports this portable `mcpServers` shape in a project `.mcp.json`
or user `~/.copilot/mcp-config.json`. For an existing `.vscode/mcp.json`, use
`servers` instead of `mcpServers` and add `"type": "stdio"` to the server entry.
Run **MCP: List Servers** from the Command Palette and start `olx`.

[Cursor configuration](https://cursor.com/docs/mcp) and
[VS Code configuration](https://code.visualstudio.com/docs/agent-customization/mcp-servers).
Photo display and vision analysis depend on the client and selected model.

## Connection checks

Docker must be installed and running where the client launches its commands.
After registration, use the client's status or probe command to confirm that
`olx` connects. If Docker is not found, use its absolute executable path.
For protocol errors, see [protocol troubleshooting](mcp-protocol.md).

The MCP SDK and Hermes have been tested with this server. The other recipes were
checked against official documentation; registration does not establish a full
agent test for each client.

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
of Docker.
