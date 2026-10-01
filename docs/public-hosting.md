# Public hosting design

Status: proposed. The current server supports stdio only. HTTP transport,
request admission, rate limits, and load testing are not implemented.

The project is MIT licensed. Anyone can run their own instance, contribute,
and distribute it while retaining the required license notices. Running a
shared public instance has infrastructure costs even when access is free.

## Transport and isolation

Keep stdio for local MCP clients. Add optional Streamable HTTP at `/mcp`
for remote clients, behind HTTPS. Validate request origins and host names.
Support deployment behind a reverse proxy. Authentication should be configurable;
a public demo can allow anonymous use with explicit quotas, while private
instances can require access credentials.

Separate MCP sessions from browser ownership. Each session should have its own
MCP server and bounded listing cache. Share a browser worker pool across sessions;
use isolated browser contexts for scraping jobs. Expiring a session must not
close the browser used by other clients.

## Concurrency

Start evaluation with two active scraping jobs per container, at most twenty
queued jobs, and one active job per client. These are proposed initial settings,
not measured capacity guarantees. Make them configurable.

One complete tool call occupies a worker slot, including retries. Release that
slot and close its browser context in a finally block. Reject excess requests
with a clear busy response rather than growing the queue indefinitely. Give
queued and running jobs explicit deadlines and propagate cancellation.

Limit requests per client and per OLX domain as well as globally. Anonymous
clients require care behind proxies: only trust forwarded addresses from
configured proxies. A session identifier alone is not a reliable abuse limit.
Short-lived result caching can reduce repeated OLX requests.

Track active jobs, queue length, wait time, request duration, failures, and memory.
Load test concurrent searches and detail calls before increasing limits. Add
browser crash recovery and graceful shutdown that stops admission and drains or
cancels work. More users should be served through additional workers, with
session routing or shared state if deploying multiple HTTP replicas.

## References

- [MCP transports specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Playwright Docker guidance](https://playwright.dev/docs/docker)
