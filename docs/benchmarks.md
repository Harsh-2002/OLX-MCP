# Performance measurements

Measured on 2026-10-02. [Raw samples, image IDs and software versions](benchmarks/2026-10-02.json)
are retained so these results can be checked. No live OLX latency or production
throughput claim is made from these fixture benchmarks.

## Previous image versus MCP v2 image

The previous image is the SDK v1 server after the scraping optimizations and
photo feature (`72d12cc`). The current image is the modern-only SDK v2 server
(`89b573d`). Both already have browser admission limits and resource filtering.

The comparison runs the actual compiled server, Chromium and stdio transport in
each Docker image. Tool execution returns fixed data: ten synthetic listings
and one 4,164-byte PNG. Tool input validation, scraping, photo downloading and
vision analysis are excluded; server output handling and protocol framing remain. Outbound networking is disabled. The same SDK v2 client
uses the previous protocol against the previous image and pins MCP 2026-07-28
against the current image. This baseline harness does not add legacy support to
the current server.

Five measured container runs per image follow an excluded warmup pair. Run order
alternates. Each operation has ten measured calls per run after a path warmup:
50 samples per image per operation. Startup includes Docker, Node/SDK, Chromium
and protocol connection, using the fixture harness rather than the unmodified
CLI. Operations are sequential; this is not a load test. The machine also runs
the normal Hermes services, so small timing differences may include scheduling
noise. Five startup samples do not establish statistical significance.

| Measurement                                        |            Previous |             Current | Interpretation                                                   |
| -------------------------------------------------- | ------------------: | ------------------: | ---------------------------------------------------------------- |
| Local Docker image size                            | 1,073,811,862 bytes | 1,060,945,919 bytes | 12,865,943 bytes smaller, approximately 1.20%                    |
| Startup, median                                    |        4,635.262 ms |        4,822.775 ms | No measured startup gain                                         |
| Uncached catalog request, median                   |            6.462 ms |           12.708 ms | Larger output-schema catalog costs more to generate and transmit |
| Search result, median                              |            4.309 ms |            5.610 ms | Approximately 1.30 ms additional local protocol/result overhead  |
| Photo result, median                               |            4.466 ms |            5.653 ms | Approximately 1.19 ms additional local protocol/result overhead  |
| Repeated cache-aware catalog lookup, median        |            5.642 ms |            0.239 ms | Approximately 95.8% lower lookup latency in this client          |
| Wire responses for 50 repeated cache-aware lookups |                  50 |                   0 | Current client's five-minute catalog cache avoids these requests |

Direct catalog, search and photo measurements bypass response caching and assert
that each request crosses stdio. The cache-aware measurement uses normal
`client.listTools()` calls after an initial fetch. Its gain applies to clients
that honor the cache hints, while the cached catalog remains valid.

Median canonical JSON response sizes, including the stdio newline:

| Response           |    Previous |     Current |
| ------------------ | ----------: | ----------: |
| Catalog            | 3,423 bytes | 7,713 bytes |
| Ten-listing search | 2,258 bytes | 4,322 bytes |
| Photo and metadata | 5,914 bytes | 6,256 bytes |

The current catalog advertises output schemas. Search data is provided as both
structured content and model-readable JSON text, increasing the response size.
Photo bytes are still emitted once; structured metadata contains no base64.
These feature costs are included in the timings, rather than removed to make the
upgrade appear faster.

## Resource-filtering control

This is a separate comparison of unfiltered page creation with the current SSR
filter, within the same current image and browser. It reproduces the earlier
unfiltered resource behavior; it is not a run of a pre-optimization Docker image.
The loopback fixture serves two image responses of approximately 512 KiB each.
There are ten measured pairs after an excluded warmup pair, with alternating
order. Both timers include page creation, full load, URL extraction and close.

| Per fixture page           | Unfiltered control | Current filter |
| -------------------------- | -----------------: | -------------: |
| Photo requests             |                  2 |              0 |
| Photo bytes served         |          1,048,712 |              0 |
| Photo source URLs retained |                  2 |              2 |
| Lifecycle time, median     |         932.987 ms |     964.897 ms |

The byte and request reductions passed on every measured pair. This proves
unnecessary photo transfers are eliminated for this SSR fixture. It does not
prove a page-latency improvement: the filtered path was slightly slower in this
local run. Loopback has none of the bandwidth constraints or latency of OLX/CDN
requests, and interception itself has overhead. Scripts and styles remain
enabled; dynamic India/Indonesia pages are outside this filter's scope.

## Reproduce

Build the previous code in an isolated Docker context, then build the current
checkout and run the measurements:

```bash
git archive 72d12cc | docker build -t olx-mcp:performance -
docker build -t olx-mcp:local .
node scripts/benchmark-mcp.mjs olx-mcp:performance olx-mcp:local
node scripts/measure-resources.mjs olx-mcp:local 10
```

Both scripts launch temporary unnamed containers and remove them afterward.
They do not change the running Hermes configuration or named MCP container.
Do not run other benchmarks or builds simultaneously when comparing timings.

Live country checks establish functionality separately. They were not a matched
before/after speed experiment. Peak RAM, sustained throughput and production
concurrency performance have not yet been benchmarked. The four-page limit,
queue bounds and cancellation are covered by correctness tests; those tests
should not be presented as throughput measurements.
