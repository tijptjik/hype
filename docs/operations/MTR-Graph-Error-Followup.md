# Follow-up: Valhalla graph-reading error

Refs [#213](https://github.com/tijptjik/hype/issues/213) and
[#194](https://github.com/tijptjik/hype/issues/194).
Related runbook: [Feature MTR access](Feature-MTR.md).

## Objective and current state

Find and repair the cause of HTTP 500 / Valhalla error 499:

```json
{"error_code":499,"error":"Unknown: GetTags: offset exceeds size of text list","status_code":500,"status":"Internal Server Error"}
```

The engine repair and complete local/rehearsal backfills are now verified; production
deployment remains a separate step. The reproduction and acceptance procedure below
is retained for regression work. Do not convert this error into
an unreachable result or substitute straight-line distances. The investigation below identifies the failing engine path and matching upstream fix.
Matching hashes prove artifact identity, not graph correctness.

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
| Original graph and config | `/home/io/code/saanseoi/.local/routing/gba/2026-10-01/valhalla/{graph.tar,config.json}` |
| Staged repaired graph and config | `/home/io/code/saanseoi/workers/routing/image-data/{graph.tar,native-config.json}` |
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
MTR_GRAPH_DIR='/home/io/code/saanseoi/.local/routing/gba/2026-10-01/valhalla'
cp .local/breadline/plans/2026-10-19-mtr-production-partial.sql.failed-request.json "$MTR_DIAG_DIR/request.json"
sha256sum "$MTR_GRAPH_DIR/graph.tar"
# Expected: dff05fbd7b562e6bd672d2ed9e6b67f0ad0cf6107eeed5369d87e155bd443a4f

docker run --detach --rm --name "$MTR_DIAG_CONTAINER" --network host \
  --volume "$MTR_GRAPH_DIR:/routing:ro" \
  --entrypoint valhalla_service "$MTR_ENGINE" /routing/config.json 1
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
- Compare the derived stations/exits against Breadline's existing reference fields
  before prioritizing manual review. Run `python3 scripts/breadline/audit-mtr.py
  --source .local/breadline/mirror.sqlite --target <rehearsal-copy.sqlite>
  --output <private-audit.json>` as one command. It reads `nearest_mtr_station_en`,
  `nearest_mtr_station_zh` and `nearest_mtr_exit`, resolving station spelling/spacing
  variants against the catalog. Dropoffs have no equivalent source fields.
  Source data is an independent reference, not an automatic overwrite: station changes,
  connected concourses, exit sublabels and pedestrian barriers can explain differences.
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

## Investigation update: 19 October 2026

The exception is raised during **reverse pedestrian graph traversal**, not trip
construction or narrative serialization. An `__cxa_throw` diagnostic shim and the
pinned executable's symbol table resolve the stack to `EdgeInfo::GetTags`,
`EdgeInfo::levels`, `PedestrianCost::TransitionCostReverse`, and reverse
`BidirectionalAStar::ExpandInner`.

Valhalla upstream commit
[`19fa3d585ff58e002f701319e6fffdbd16834d66`](https://github.com/valhalla/valhalla/commit/19fa3d585ff58e002f701319e6fffdbd16834d66)
([#6291](https://github.com/valhalla/valhalla/pull/6291)) repairs the matching
cross-tile elevator-level lookup. Version 3.8.3 looks up a predecessor tile but
passes an edge pointer belonging to another tile into `edgeinfo`. The fix obtains
that tile's own directed edge using `edge_id` before reading levels. It preserves
routing failures and elevator penalties; it does not skip candidates or tags.

Source PBF, boundary, original graph bundle and deployed archive checksums were
verified against the retained GBA recipe and manifest. The retained recipe pins
the same runtime digest; the image reports 3.8.3 but has an empty
`/usr/local/valhalla_version`, so it does not independently attest the historical
builder source commit. The fresh rebuild below ran with the pinned image.

| Engine | Graph/loading | Original failing request | Reversed request | Control |
| --- | --- | --- | --- | --- |
| Pinned 3.8.3 | Original archive | 500 / 499, repeated | 200 | Not replayed |
| Pinned 3.8.3 | Original tiles extracted into a new directory | 500 / 499, repeated | 200 | Not replayed |
| Pinned 3.8.3 | Fresh build from retained recipe | 500 / 499 | 200 | 200 |
| 3.8.3 plus #6291 | Original archive | 200, repeated | 200 | 200 |
| 3.8.3 plus #6291 | Fresh compatible graph | 200 | 200 | 200 |

Both same-endpoint probes return 200 with the original archive and extracted tiles.
The successful control is selected from the prior backfill checkpoint. Request
bodies and responses remain private. The fresh original-engine graph SHA is
`7123c34c1d82eb0663605e0332c519daf35db148e9324488d039568779a9e35d`;
it is **not** a repaired release. Both engine packages were rebuilt into a new
directory without copying completion markers.

GDB on the original source confirms the failing lookup at `pedestriancost.cc:851`:
current tile `2/646296`, predecessor tile `2/647736`, predecessor edge index 2952.
The wrong-tile read yields name offset 1,049,479 against a 110,564-byte text list.
This is an engine edge/tile ownership defect, not evidence of corrupt tile contents.
The synthetic upstream elevator regression fails with the original lookup and passes
with the backport. All 24 indoor-routing tests pass with the repair.

### Repaired release and complete backfill

- Release: `gba-2026-10-01-valhalla-6291`.
- Graph SHA: `f775900729629bc448586a06a8dfc7b5a73b6d94bcd63ecc2e585b382a35e2b6`.
- Bundle SHA: `0c5448b714caed50ca8a6ae8f854139de5817fd7f3adfd4693e9e766fb2fd677`.
- Source: Valhalla 3.8.3 commit `a60c7cbfc83e073f50887cd27e0109d02e6b64e5`
  plus the exact #6291 implementation and regression test.
- Private evidence, plans, checkpoints and pre-application backup:
  `.local/breadline/mtr-repair-20261019/`.

The SaanSeoi routing Dockerfile builds the pinned source/backport, runs the indoor
suite and verifies the packaged graph against its release metadata. The patch and
`engine-release.json` are retained beside it. `deploy-service.py` now supports
`--stage-only --local-bundle <bundle> --bundle-sha256 <sha> --release <identity>`
(with the existing `preview` positional argument). This path verifies engine and
bundle identity before staging and returns before credentials, publication or
deployment. Three offline staging tests cover success/idempotence, identity reuse,
checksum failure and engine mismatch. No registry push or production deployment ran.

| Dataset | Features | Ready | Unreachable | Engine failures | Remaining jobs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production-snapshot rehearsal | 2,315 | 2,284 | 31 | 0 | 0 |
| Active local database | 2,318 | 2,287 | 31 | 0 | 0 |
| Breadline subset (both) | 485 | 483 | 2 | 0 | 0 |

Both plans ran without `--allow-partial`. The bulk rehearsal resumed with four
service threads using only checkpoints created by this same repaired image and graph;
no checkpoint from the broken engine was reused. The local plan reused the completed
repaired checkpoint and made 17 additional route requests for local geometries.
All 60 former failures were rechecked: 29 are ready and 31 are unreachable. Every
unreachable feature checked all 635 entrances. Engine errors still abort; none were
converted to unreachable results.

The 113-route audit includes the nearest three entrances for each unreachable
feature: 48 routes require a ferry and 45 exceed the 75-metre endpoint-snap limit.
The other 20 samples cover long walks, barrier detours, station-boundary choices and
spatial station associations; all reproduce their ready distances and acceptable
endpoint snaps. This is sampled route evidence, not certification of every physical
entrance or every spatial station association; the reference review queue below
remains relevant.

Plans were applied transactionally to the rehearsal and, after an online SQLite
backup, the active local database. Integrity and foreign keys pass, all geometry
identities were checked before local application, and non-MTR feature fields and
other table counts were preserved. A disposable-database integration check proves
new and moved features recalculate against the repaired engine; an injected outage
returns retry and retains its job. Twenty-four focused card/MTR tests, both Worker typechecks,
and the retry Worker preview dry-run pass. The real shared-service handler's auth,
normalization, native envelope, no-store policy and staged graph identity pass via
a local container transport adapter; deployed Cloudflare behavior remains unverified.

The complete staged Dockerfile build also passes its 24 indoor tests and graph
checksum assertion. The resulting **local image ID** is
`sha256:c6c9361210a7f258e5bb88ee587a745eb81a0efc9e0e7f07d38f2dd7a89f0d0a`;
this is not a published registry digest. Its service and graph-builder binaries
are byte-identical to those used for the full backfill. Native original/reverse/control
requests and the shared-service handler checks pass against the final packaged image.

### Card verification

The experimental MTR row on default full and compact cards was removed by product
decision. MTR presentation is reserved for a future Breadline-specific card. Earlier
browser checks of that experiment are historical evidence, not acceptance of the
current card design. Routing and persisted MTR access data are unchanged.
The whole-app check reports 10 errors outside the changed card/helper files (map,
panel and test paths); it is not a clean application-wide check.
The final checks used a stable source snapshot, an isolated copy of the repaired
SQLite database and the existing local test persona; concurrent hot reloads had
invalidated earlier attempts. No real-user session or production data was used.
All task-owned diagnostic containers and verification servers were stopped; artifacts
and private backups remain available. Delivery updates:
[#213](https://github.com/tijptjik/hype/issues/213#issuecomment-6267179248) and
[#194](https://github.com/tijptjik/hype/issues/194#issuecomment-6267182596).





## Breadline reference comparison (19 October 2026)

The existing source data substantially narrows the review. Of 466 donors, 396 match the
derived station, 26 differ, 41 have no recorded station, two have a mapped source station
but unresolved derived access, and one references West Kowloon high-speed rail outside
the local-MTR catalog. Thus 396 of 422 comparable station results agree. Six of the 26
station differences are Tsim Sha Tsui versus East Tsim Sha Tsui; these remain visible
in the report rather than being silently treated as identical stations.

Among derived entrances using spatial station association, 76 donor station references
agree, four differ and 11 have no source reference. These counts cover donor results,
not every spatially associated entrance in the catalog. Prioritize those four differences
for station-association review. For matching stations with comparable nonempty exit
labels, 172 labels match exactly and 192 differ. Differences are review candidates, not
proof of a routing fault; parent exit labels and numbered sub-exits are compared strictly.

Donor 171's source explicitly records Tai Wai / 大圍, exit D. The corrected location
also resolves to Tai Wai exit D (271 walking metres in the partial backfill). This
corroborates station/exit access but does not establish the exact shop entrance; retain
the approximate-coordinate provenance and location-review flag until that is checked.
The private row-level audit is `.local/breadline/plans/2026-10-19-mtr-source-audit.json`.

These are historical pre-review counts. The completed schedule-filtered review and
64 accepted import decisions are recorded in
[the donor import policy](../../spec/breadline/proposal/donor-import-policy.md).

## Distance-policy acceptance (19 October 2026; read-only)

A fresh run of the repaired pinned engine with `walk-1000m-v1` evaluated all 1,759
current local features using 8,614 requests, with zero engine failures. Automatic
comparison results: 1,666 ready / 93 unreachable, including 446 ready / 39 unreachable
Breadline features. Preserve the 64 saved review decisions: this automatic comparison
is not an applied plan. It also does not replace the two accepted but unmapped exit
labels with invented entrance IDs. No unreviewed feature with stored access within
1 km changed station. There are 84 stored walks over 1 km, including 37 Breadline
locations; data application is on hold.

A second pass replayed all 462 mapped donor access routes and compared reference
entrances in 722 requests. Every persisted mapped route reproduced within 3 metres;
no engine failures occurred. Current source comparison remains 396 matching stations,
26 different stations, 41 missing source stations, two unresolved derived results,
and one out-of-scope high-speed station. There are 161 strict exit-label differences;
combined with station differences these make 187 review candidates. Saved source
choices and calculated choices remain intact, not silently overwritten.

All four nearest-station association disagreements have a shorter reproducible route
to the selected entrance than to the source reference: Tsim Sha Tsui D1 / Jordan E
(21 / 767 m); Hong Kong C / Central C (205 / 287 m); Hong Kong C / Central D2
(338 / 406 m); Tai Wo B / Tai Po Market (933 / at least 1,366 m among tested source
entrances). This supports the routing comparison, but is not independent proof of
station ownership or physical entrance accessibility. Those physical checks and the
two unmapped accepted labels remain explicit acceptance limitations.

The three location investigations found two bakery points inconsistent with their
source addresses, while Nam Wan Bookshop's Peng Chau point is about 16 m from the
bundled OSM building with the same name. Its displayed Wan Chai address is inconsistent
with that evidence. No feature coordinates or addresses were changed.

Private evidence: `.local/breadline/mtr-1km-review/{results,source-audit,acceptance}.json`.
Map artifact: `output/mtr-location-review/index.html` and `map.png`. Reference landmark
centroids are comparison anchors, not verified replacement shop coordinates.
