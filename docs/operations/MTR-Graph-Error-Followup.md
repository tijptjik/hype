# Follow-up: Valhalla graph-reading error

Refs [#213](https://github.com/tijptjik/hype/issues/213) and
[#194](https://github.com/tijptjik/hype/issues/194).
Related runbook: [Feature MTR access](Feature-MTR.md).

## Objective and current state

Find and repair the cause of HTTP 500 / Valhalla error 499:

```json
{"error_code":499,"error":"Unknown: GetTags: offset exceeds size of text list","status_code":500,"status":"Internal Server Error"}
```

Then regenerate and verify the complete MTR backfill. Do not convert this error into
an unreachable result or substitute straight-line distances. The root cause is not
yet established: matching hashes prove artifact identity, not graph correctness.

Evidence from 19 October 2026:

- Fresh Breadline and HYPE exports were used. Schema migrations 0095–0098 and the
  466-bakery / 19-drop-point import were applied locally, preserving existing content.
- Local backfill: 2,258 ready, 60 failures; Breadline coverage: 479/485.
- Production-snapshot rehearsal: 2,255 ready, 60 failures. Three additional ready
  features existed only locally. These are historical counts; recheck live local state.
- The error reproduced with standalone curl, the pinned engine image, and one service
  thread. Two threads also failed. Disabling turn-by-turn narrative did not fix it.
- The graph archive SHA matches the release manifest. No production writes or deployment
  occurred. Task-owned router and verification server were stopped.

## Preserve these inputs

Work in `/home/io/code/hype`. Check `git status` in both Hype and SaanSeoi before editing;
concurrent unrelated work exists. Keep exports, requests and feature IDs private.

| Artifact | Location |
| --- | --- |
| Native graph and config | `/home/io/code/saanseoi/workers/routing/image-data/{graph.tar,native-config.json}` |
| Release identity | `/home/io/code/saanseoi/workers/routing/graph-release.json` |
| Pinned build toolchain | `/home/io/code/saanseoi/scripts/routing/toolchain.json` |
| Failing request | `.local/breadline/plans/2026-10-19-mtr-production-partial.sql.failed-request.json` |
| Failure IDs and receipt | `.local/breadline/plans/2026-10-19-mtr-production-partial.sql.{failures,receipt}.json` |
| Rehearsal database | `.local/breadline/hype-mtr-rehearsal.sqlite` |
| Original HYPE export restored to SQLite | `.local/breadline/hype-production-export.sqlite` |
| Fresh Breadline source mirror | `.local/breadline/mirror.sqlite` |
| Local partial plan and checkpoint | `.local/breadline/plans/2026-10-19-mtr-local-partial.sql*` |

The saved request is one failing candidate route, not all 60 failures. The failure list
contains feature IDs; a feature can fail because any candidate route errors, even if
another entrance has a valid route. The backfill must not silently skip that candidate.
Do not use `.local/breadline/hype-production-fresh.sqlite`: that earlier restore was interrupted.

## Reproduce independently of Hype

Run from the Hype root. Verify port 8002 is free first; do not stop another service to
claim it. The commands below use a unique container name and a new private evidence
directory. They do not modify the graph or either database.

```bash
umask 077
MTR_DIAG_DIR=$(mktemp -d /tmp/hype-mtr-graph.XXXXXX)
MTR_DIAG_CONTAINER="hype-mtr-diagnose-$(date +%s)"
MTR_ENGINE='ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f'
MTR_GRAPH_DIR='/home/io/code/saanseoi/workers/routing/image-data'
cp .local/breadline/plans/2026-10-19-mtr-production-partial.sql.failed-request.json "$MTR_DIAG_DIR/request.json"
sha256sum "$MTR_GRAPH_DIR/graph.tar"
# Expected: dff05fbd7b562e6bd672d2ed9e6b67f0ad0cf6107eeed5369d87e155bd443a4f

docker run --detach --rm --name "$MTR_DIAG_CONTAINER" --network host \
  --volume "$MTR_GRAPH_DIR:/routing:ro" \
  --entrypoint valhalla_service "$MTR_ENGINE" /routing/native-config.json 1
trap 'docker stop "$MTR_DIAG_CONTAINER" >/dev/null 2>&1 || true' EXIT

# Wait for the service to start before sending the request.
docker logs "$MTR_DIAG_CONTAINER"
curl --noproxy '*' --silent --show-error --max-time 60 \
  --dump-header "$MTR_DIAG_DIR/headers.txt" \
  --output "$MTR_DIAG_DIR/response.json" \
  --header 'Content-Type: application/json' \
  --data-binary "@$MTR_DIAG_DIR/request.json" \
  http://127.0.0.1:8002/route
cat "$MTR_DIAG_DIR/headers.txt" "$MTR_DIAG_DIR/response.json"
docker logs "$MTR_DIAG_CONTAINER" > "$MTR_DIAG_DIR/router.log" 2>&1
```

Expected reproduction is HTTP 500 and the JSON above. A connection refusal is only a
startup/network failure; retry after checking logs. Keep one successful pedestrian
request as a control, using a route already verified by the partial backfill.

## Isolate the cause before changing releases

1. Read SaanSeoi's `scripts/routing/build.py`, `deploy-service.py`, `toolchain.json`
   and `workers/routing/Dockerfile`. Locate the retained recipe/source bundle for
   `gba-2026-10-01`; verify its checksums and actual builder image identity. Do not
   replace the recipe with a mutable latest source or assume the runtime digest proves
   which binary built every tile.
2. Reproduce the failing request repeatedly in a fresh process alongside the successful
   control. Record whether direction reversal or individual endpoint correlation
   changes the error. Keep the original request unchanged as the regression fixture.
3. Isolate archive loading: inspect archive members, extract into a **new** diagnostic
   directory, and make a copied config with `tile_extract` empty and `tile_dir` pointing
   at the extracted tile root. Replay the identical requests. Do not edit the deployed
   `image-data` directory. This distinguishes packed-archive access from tile contents.
4. Obtain a native stack trace or instrument the matching Valhalla source around
   `GetTags`. Identify the failing tile/edge and whether failure occurs during graph
   traversal, trip construction, or output serialization. An error string alone does
   not establish which stage is faulty.
5. Rebuild from the retained recipe into a new directory using
   `python3 /home/io/code/saanseoi/scripts/routing/build.py --recipe <verified-recipe> --out <new-directory>`.
   The builder currently creates both engine packages and has meaningful disk/time
   requirements. Inspect its behavior and resource limits before running it. Never
   reuse an old completion marker as evidence of a fresh build.
6. Compare original versus rebuilt graph on the same pinned runtime. If testing a
   Valhalla fix/upgrade, pin its exact source/image and build a compatible graph too.
   Change one variable at a time. Do not conceal the error by swallowing it or deleting
   problematic features/entrances.

Record the result matrix: engine identity, graph SHA, config, original failing request,
successful control, HTTP status and error. Keep request bodies and raw exports out of
public issues. A public reproduction needs an explicitly reviewed non-sensitive fixture.

## Complete the backfill after the fix

- Give the repaired graph an immutable release identity and compute its real SHA.
  Update the shared-service graph metadata through its normal release process; do not
  merely relabel the old archive. Production deployment is a separate authorized step.
- Run against a fresh copy of the rehearsal database, using a **new output path** and
  the repaired graph SHA. If only the engine changed, a new output path is essential:
  current checkpoints key graph/catalog/geometry, not engine version.
- Run without `--allow-partial` for the acceptance pass:

```bash
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
  bun scripts/backfill-feature-mtr.ts \
  --database <rehearsal-copy.sqlite> \
  --endpoint http://127.0.0.1:8002 \
  --graph <actual-repaired-graph-sha256> \
  --output <new-private-complete-plan.sql>
```

- Require zero engine failures. A legitimately unreachable or unsupported result may
  remain empty, but must have its explicit status and evidence; do not require every
  feature to have an MTR station regardless of geography.
- Recheck all previously failed features, then sample station boundaries, entrances
  across roads/barriers, long walks and the catalog's spatial station associations.
  Check route endpoint snapping rather than accepting plausible-looking distances.
- Apply the complete plan transactionally to the rehearsal; verify foreign keys,
  integrity, geometry guards, ready/status counts and remaining jobs. Back up active
  local SQLite before applying there. Do not reset or replace the user's local database.
- Run focused MTR tests, Worker typecheck/dry-run and real card checks. Validate the
  repaired graph through the shared routing-service contract as well as native Valhalla
  before production acceptance. Confirm newly created/moved features recalculate, and
  failures still retain their durable jobs.
- Update #213/#194 and their domain documents with the root cause, exact repair,
  regression evidence and revised coverage. Keep broad acceptance items unchecked until
  verified. Stop only diagnostic containers/servers started for this investigation.
