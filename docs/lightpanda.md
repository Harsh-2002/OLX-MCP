# Lightpanda compatibility evaluation

Lightpanda is an experimental alternative to Chromium. This evaluation leaves the
production Docker image and client configurations on Chromium.

## Reproduce

```bash
npm ci
npm run build
node scripts/test-lightpanda.mjs --output=/tmp/lightpanda-report.json
```

The runner starts a separate Docker container for each capability check and
country. It pins the browser image, disables telemetry, binds CDP to localhost,
limits memory to 1 GiB, and removes its containers when finished. Docker and
network access are required. A failed check exits nonzero.

The country checks use the real MCP SDK client, server, existing scraper adapters,
and image downloader. The experimental `--cdp` argument in `test-live-mcp.mjs`
connects the test process to Lightpanda; it is not a production CLI option.
Results contain statuses and image metadata, without listing content.

## Results on 2026-10-02

The tested browser is `1.0.0-nightly.9990+28c84cc47`, with Playwright from
this repository. The sanitized raw report is in
[the evaluation results](benchmarks/lightpanda-2026-10-02.json).

The Chromium control used the published image digest
`sha256:498fcc944b62824881bfa3c755160eb11cb1a6ca39b553f26099ddfec78879f6`.
Seven countries passed the first complete live matrix. Kazakhstan details and
Uzbekistan page 2 failed once; both passed fresh, separate retries. Those initial
failures remain in the report. Live website checks sample current listings and
are not a guarantee that every listing will remain available.

## Findings

Basic DOM extraction works. The tested nightly rejects disabled JavaScript and
multiple isolated browser contexts. A Playwright click on a simple visible button
also times out. These are required behaviors in the current scraper layer, so
Lightpanda is not ready to replace Chromium here.

India location lookup, search, details, photo attachment, and Mumbai checks passed,
but countrywide page 2 timed out. European search adapters failed while creating
browser contexts. Their disabled-JavaScript setting is separately confirmed as
unsupported; retries can then surface the one-context restriction instead.

Indonesia search, details, and photo attachment passed, but clicking its load-more
button timed out. Kazakhstan and Uzbekistan location lookup timed out while
clicking their location field; searches also failed at context creation.
No country completed its entire Lightpanda check successfully.

| Check                                        | Lightpanda                                                   | Chromium control |
| -------------------------------------------- | ------------------------------------------------------------ | ---------------- |
| Portugal, Poland, Bulgaria, Romania, Ukraine | Search blocked at context creation                           | Passed           |
| India                                        | Search, details, photos passed; countrywide page 2 timed out | Passed           |
| Indonesia                                    | Search, details, photos passed; load-more click timed out    | Passed           |
| Kazakhstan                                   | Location click and search failed                             | Passed on retry  |
| Uzbekistan                                   | Location click and search failed                             | Passed on retry  |

A future integration would need explicit handling for these differences, including
browser isolation and concurrency. No workaround or production migration is
included in this experiment.

The browser-only image is 360,052,035 bytes on AMD64. That is not comparable to the
complete OLX MCP image, which also contains Node.js and the application. There is
no verified application size, memory, or speed improvement from this experiment.
ARM64 was not tested.

Lightpanda documents [Playwright via CDP](https://lightpanda.io/docs/usage/cdp/playwright)
and its [partial browser architecture](https://lightpanda.io/docs/core-concepts/architecture-overview).
Its published [benchmarks](https://lightpanda.io/docs/core-concepts/benchmarks)
measure a different workload and do not establish OLX performance.
Review its [licensing](https://github.com/lightpanda-io/browser/blob/main/LICENSING.md)
before distributing an image containing Lightpanda.
