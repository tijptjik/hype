# Monthly upstream indoor-map refresh

Run from the Hype Git root. The implementation is TypeScript, executed by Bun. A small
shell entrypoint holds a kernel `flock` across manual and scheduled runs; there is no
Python dependency. Every operation requires `--target local|prod`.

```sh
bun run dataops -- indoor:fetch-mtr --target local
bun run dataops -- indoor:fetch-buildings --target local
bun run dataops -- indoor:compare --target local --snapshot /path/to/snapshot
bun run dataops -- indoor:publish --target local --snapshot /path/to/snapshot
bun run dataops -- indoor:monthly --target local
```

Fetch commands accept `--out NEW_DIRECTORY`. Without it, snapshots are retained in
`~/.local/state/hype/indoor-dataops/{target}/`. These commands download upstream content
without changing database publications. Both families preserve all six WFS layers, exact
decompressed response hashes, source URLs, retrieval timestamps and compressed original
responses. Counts, pagination and duplicate source IDs are validated. Invalid geometry
is retained and reported instead of silently omitted.

`compare` writes `comparison.json` and never changes database or R2 content. Its
statuses are `new`, `changed`, `unchanged`, `missing`, `invalid` and `blocked`. The
report includes the current published release hash and both source-content hashes. It
resolves the uncorrected snapshot referenced by the published release; it does not
compare upstream polygons with our corrected labels.

The `landsd-content-v1` comparison hash includes exact geometry and source attributes.
It excludes local retrieval/publication metadata, transport feature IDs, derived
bounding boxes, feature ordering and our connector/document curations. Coordinate
precision is not reduced. Existing publications require no hash migration: the tool
computes the same hash from their retained source snapshot. Venue UUIDs, not names or
proximity, match existing maps, including legacy Hysan Place publications.

`publish` compares again before writing. Unchanged maps are no-ops. Changed/new maps
retain their source, replay corrections, upload immutable resources and publish through
optimistic version fences. A `map-upstream-published` task is created in the same
database transaction as the publication. It appears in the existing super-admin system
task list and contributes to its count. Automatic publication does not mark connector
evidence as editor-verified. Repeating a successful run creates neither another
publication nor another review task.

Unpublished edits, unsafe legacy connector edits, unrecorded polygon curations, missing
upstream venues and correction conflicts preserve the current publication and create
deduplicated review issues. Missing venues are not deleted. Operational failures exit
nonzero; database writes are never blindly retried. A failure after saving a draft can
require admin review before the next automatic publication.

| Target  | Database                                                     | Published assets                                                       |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `local` | Existing local Miniflare D1                                  | Development R2 plus local R2; remote upload precedes local publication |
| `prod`  | Production D1 through authenticated Wrangler remote bindings | Production R2                                                          |

Production commands require existing Wrangler credentials and the map/system-task
schema. Local publication also requires the configured `r2-tijpdata` rclone remote.
These commands do not deploy Workers or apply migrations. Snapshots are target-bound: a
local snapshot cannot accidentally be published to production.

The persistent user timer `hype-indoor-monthly.timer` runs at 03:00 Hong Kong time on
the first day of each month, with up to ten minutes jitter. `Persistent=true` catches
missed runs when the user systemd manager next starts. With user lingering enabled, this
is boot; otherwise it is login. The service retries operational failures hourly and uses
`dev-check` to share the local validation lock and memory limit.

Install or update the timer with
`bash scripts/dataops/install-systemd.sh --target local`. The timer defaults to `local`.
To select production, use a service override:

```ini
[Service]
Environment=HYPE_INDOOR_TARGET=prod
```

`indoor:monthly` fetches and publishes both families. Completed snapshots are
checkpointed across publication failures, and a per-target Hong Kong calendar-month
receipt prevents repeated successful runs. Invalid/conflicting maps are left as review
tasks while valid maps progress. Snapshots and reports are retained; fetching stops if
less than 1 GiB remains. Inspect failed runs and storage rather than deleting provenance
automatically.

```sh
systemctl --user list-timers hype-indoor-monthly.timer
journalctl --user -u hype-indoor-monthly.service
```

Legacy maps with retained originals can acquire a verified baseline without replacing
their published or draft curations:

```sh
bun run dataops -- indoor:reconcile-baseline --target local --map MAP_ID --source ORIGINAL_DIRECTORY --actor-user-id USER_ID
```

The default is a read-only plan. Add `--apply` to upload immutable resources and
atomically attach the baseline and reconstructed corrections. Each of the six original
layers must match its retained manifest checksum. Geometry differences are rejected.
Published and draft views remain separate, existing correction authors and reasons
survive, and the corresponding missing-baseline task is resolved. Local application
uploads to development R2 before changing local pointers.
