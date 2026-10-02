#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OLX_DOMAINS } from './core/domains.js';
import { OLXMCPServer } from './core/server.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Handle --version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(version);
  process.exit(0);
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
OLX MCP Server v${version}
A Model Context Protocol server for searching OLX listings across supported OLX country sites.

Usage: olx-mcp

Requires an MCP 2026-07-28 client; earlier protocol versions are rejected.
Example server configuration:

{
  "mcpServers": {
    "olx-mcp": {
      "command": "olx-mcp"
    }
  }
}

Supports domains: ${OLX_DOMAINS.join(', ')}
  `);
  process.exit(0);
}

async function main() {
  const server = new OLXMCPServer({
    name: 'olx-mcp-server',
    version: version,
    headless: true,
  });

  // Set up graceful shutdown
  const cleanup = async () => {
    await server.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', async error => {
    console.error('Uncaught exception:', error);
    await server.cleanup();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    await server.cleanup();
    process.exit(1);
  });

  try {
    // Start Chromium only after a valid modern opening selects this server.
    server.serve(undefined, () => server.initialize());
    console.error('OLX MCP Server started successfully'); // Log to stderr to avoid interfering with STDIO
  } catch (error) {
    console.error('Failed to start server:', error);
    await server.cleanup();
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async error => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}
