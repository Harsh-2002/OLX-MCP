# OLX MCP

Search OLX listings, view details, and show listing photos from your AI assistant.
Supported countries: 🇵🇹 Portugal · 🇵🇱 Poland · 🇧🇬 Bulgaria · 🇷🇴 Romania ·
🇺🇦 Ukraine · 🇮🇳 India · 🇮🇩 Indonesia · 🇰🇿 Kazakhstan · 🇺🇿 Uzbekistan.

## Quick start

Install Docker, then pull the image:

```bash
docker pull ghcr.io/harsh-2002/olx-mcp:latest
```

One image supports AMD64 and ARM64, including Apple Silicon. Node.js and Chromium
are included. No OLX account or API key is needed.

To start the stdio server directly:

```bash
docker run --log-opt max-size=10m --log-opt max-file=3 --rm -i --shm-size=256m ghcr.io/harsh-2002/olx-mcp:latest
```

The server waits for an MCP client. For everyday use, let your client start it
with one of the setups below.

## Connect your client

<details>
<summary>Codex CLI</summary>

```bash
codex mcp add olx --env CODEX_MCP_PROTOCOL_VERSION=2026-07-28 -- docker run --log-opt max-size=10m --log-opt max-file=3 --rm -i --shm-size=256m ghcr.io/harsh-2002/olx-mcp:latest
codex --enable mcp_2026_07_28
```

</details>

<details>
<summary>Claude Code CLI</summary>

```bash
claude mcp add --scope user --transport stdio olx -- docker run --log-opt max-size=10m --log-opt max-file=3 --rm -i --shm-size=256m ghcr.io/harsh-2002/olx-mcp:latest
MCP_SDK_GENERATION=v2 MCP_PROTOCOL_NEGOTIATION=auto claude
```

Check the connection with `/mcp`.

</details>

<details>
<summary>OpenCode v2</summary>

Add this entry under `mcp.servers` in your `opencode.json` or `opencode.jsonc`,
then start `opencode`:

```json
{
  "mcp": {
    "servers": {
      "olx": {
        "type": "local",
        "command": [
          "docker",
          "run",
          "--log-opt",
          "max-size=10m",
          "--log-opt",
          "max-file=3",
          "--rm",
          "-i",
          "--shm-size=256m",
          "ghcr.io/harsh-2002/olx-mcp:latest"
        ],
        "protocol": "auto"
      }
    }
  }
}
```

</details>

<details>
<summary>Hermes Agent</summary>

```bash
hermes mcp add olx --command docker --connect-timeout 60 --args run --log-opt max-size=10m --log-opt max-file=3 --rm -i --shm-size=256m ghcr.io/harsh-2002/olx-mcp:latest
hermes chat
```

Select the discovered capabilities when prompted. In an existing session,
use `/reload-mcp` instead of restarting.

</details>

<details>
<summary>OpenClaw</summary>

```bash
openclaw mcp add olx --command docker --arg run --arg=--log-opt --arg=max-size=10m --arg=--log-opt --arg=max-file=3 --arg=--rm --arg=-i --arg=--shm-size=256m --arg ghcr.io/harsh-2002/olx-mcp:latest
openclaw mcp doctor olx --probe
```

Check that the probe succeeds before starting a chat.

</details>

For Cursor, VS Code, desktop clients, and configuration alternatives, see
[client integrations](docs/integrations.md).

Then ask your assistant:

> Find laptops in Mumbai under INR 25,000 and show two photos of the first result.

To update, pull `latest` again and restart the MCP connection.

Licensed under [MIT](LICENSE).
