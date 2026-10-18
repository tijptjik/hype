# Routing runtime experiment

Refs [EXT-1 #213](https://github.com/tijptjik/hype/issues/213), parent
[#186](https://github.com/tijptjik/hype/issues/186), and the
[technical domain](../../spec/breadline/proposal/09-enhancements.md).

This is an isolated benchmark, not Hype application routing. It uses native
Valhalla 3.8.3 and `valhalla-server@0.2.1` against identical graph bytes. Full
response client timings include HTTP and decoding. First-use sweeps do not
guarantee cold isolates; WASM responses expose isolate identities, first-use
flags, graph downloads and heap-capacity diagnostics.

## Build

```sh
git clone --depth 1 https://github.com/tobilg/valhalla-wasm.git /tmp/hype-routing-valhalla-wasm
git -C /tmp/hype-routing-valhalla-wasm fetch origin 53db62e78891b51e06600ed6369005c975ce5835
git -C /tmp/hype-routing-valhalla-wasm checkout 53db62e78891b51e06600ed6369005c975ce5835
docker pull ghcr.io/valhalla/valhalla:3.8.3
SDK_SOURCE=/tmp/hype-routing-valhalla-wasm python3 scripts/routing/build-graph.py /absolute/input.osm.pbf
```

The SDK checkout used for the initial experiment was recorded in the results.
Use that revision to reproduce its archive validator. The builder is capped at
3 GiB RAM and two CPUs; it writes only to ignored `build/routing-benchmark` and
`workers/routing-benchmark/container/data`. Existing completed graphs are refused.
The image is pinned by digest. Inspect the largest tile before selecting the
runtime cache: the HK graph's largest tile exceeds 32 MiB.

No admin/timezone database, elevation, traffic or GTFS feed is imported. This
experiment cannot prove time-dependent restrictions or transit correctness.

## Workers

Run `npm ci --ignore-scripts` in `workers/routing-benchmark`. Both configurations
are independent of Hype. Create a benchmark-only secret through Wrangler; the
local `.dev.vars` files are ignored. Both endpoints require bearer authentication.
Never include credentials in benchmark artifacts or shell arguments.

The dedicated deployment token lives in Git-ignored `.env.routing-benchmark.local`
with owner-only permissions. Use the wrapper below: it overrides an older token
already exported in the parent shell without printing either credential.

```sh
python3 scripts/routing/wrangler.py deploy --config workers/routing-benchmark/container/wrangler.jsonc
python3 scripts/routing/wrangler.py containers list
```

The WASM Worker uses the dedicated private `hype-routing-benchmark` R2 bucket.
Upload the generated `graph.tar` and `config.json` under
`datasets/hk-2026-10-01/`, deploy the Worker, then run:

```sh
bun --env-file=workers/routing-benchmark/.dev.vars scripts/routing/prepare-r2.ts
```

Upload the resulting manifest last. This records R2's actual ETag; the graph's
SHA-256 is not an R2 ETag. Generate bindings with `wrangler types` for each
configuration before running its focused TypeScript check.

The native image includes the same graph and uses one routing thread. Its
Cloudflare config now selects custom one vCPU / 3 GiB / 2000 MB disk, at most two
instances and a two-minute idle timeout. All requests use the same named instance;
the limit of two is a ceiling, not a warm pool. The native Worker has an authenticated `POST /stop`
for explicit cold-start measurements and cleanup. An uploaded Worker alone
does not prove that its container application was provisioned successfully.

### Intent warm-up contract

- `POST /warmup` needs no coordinates and returns `{ ready: true,
  idleTimeoutSeconds: 120 }` when port 8002 is ready. Fire this when opening the
  future in-app directions flow; open the parameter UI immediately.
- `POST /route` accepts the existing validated payload and waits for startup
  independently. A slow, skipped or expired warm-up must not block calculation.
- Each warm-up or completed route refreshes the shared two-minute idle window.
  In-flight routes defer expiry. No heartbeat or background warm-up is needed.
- Authenticated `GET /state` is passive. `POST /stop` awaits actual termination.
  Idle expiry also uses `destroy()` because Valhalla can linger after SIGTERM.
- These are protected benchmark endpoints. The future app server must authorize
  users and proxy via a server-side secret or service binding; never put the
  benchmark bearer token in browser code. Apply app rate limits before launch.

The initial in-app integration now calls this contract through session-required
remote commands and a private service binding. See the
[navigation integration notes](../../docs/benchmarks/navigation-2026-10-18.md).
Production deployment, graph updates and broader application integration remain
acceptance work under #213.

Run `lifecycle-deployed.ts` with the benchmark environment file to assert cold
concurrent readiness/route calls, a route resetting the deadline, passive polling,
abandoned warm-up expiry and cold routing without a warm-up. Run it alone: other
benchmarks share the engine and intentionally affect its idle timer. Evidence is
written after each request; the real idle checks take about six minutes.

## Measure

```sh
bun --env-file=workers/routing-benchmark/.dev.vars scripts/routing/benchmark.ts \
  --native https://hype-routing-native-benchmark.hypehk.workers.dev \
  --wasm https://hype-routing-wasm-benchmark.hypehk.workers.dev \
  --output build/routing-benchmark/deployed-comparison.json --repetitions 10
```

Use only available endpoints: the native Cloudflare application was blocked by
token permissions during the initial experiment; a dedicated token was added
for the subsequent deployment. The runner also accepts raw
native Valhalla HTTP responses for localhost Docker tests. `--modes motor_scooter
--concurrency ''` selects a native scooter run. Do not interpret CPU timings from
local Docker as deployed end-user timings. Do not compare first-use with a warm
engine as if both were cold.

For local native tests, use a localhost-only listener and one CPU / one GiB.
Docker bridge forwarding failed on the initial host; host networking with a
`127.0.0.1:8795` listener worked. `cold-native.py` restarts only the specifically
named disposable benchmark container with zero drain time. Its graph and image
are already local: these are process-start measurements, not Cloudflare starts.

Store samples, failures, route summary/geometry hashes and successful p50/p95
values together. A valid no-route response must remain distinguishable from
memory or queue failure. The cross-harbour cycling case deliberately exercises
an unreachable route in this graph; the walking case includes an untimetabled
ferry edge. Agreement between engines is parity evidence, not field validation
of OSM access, crossings, speed or route quality.

For explicit deployed native cold starts, run `cold-deployed.ts` with the same
benchmark `.dev.vars`. It calls the authenticated stop endpoint before each
route, verifies the returned stopped state and records shutdown time separately
from first-route latency. The endpoint awaits `destroy()`: SDK `stop()` only
sends SIGTERM, so it is insufficient proof of a cold process.

Stop agent-started local Workers and containers after testing, and explicitly
stop the deployed native benchmark when finished. The dedicated token has now
enabled the paired deployed comparison. Dedicated HK/mobile clients and container
placement tuning remain follow-up work; a configured APAC location is not proof
of the executing region.
