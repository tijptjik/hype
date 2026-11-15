# MTR source baseline

The initial network-wide Lands Department geometry baseline is staged outside
`.research` so the research sync timer cannot upload a partial collection.

```sh
dev-check python3 scripts/indoor/collect-mtr-baseline.py \
  /tmp/hype-mtr-venues.json \
  /home/io/.local/state/hype/mtr-baselines/2026-11-15-initial
```

Fetch the inventory from the `mtr_venue_polygon` WFS endpoint using `GetFeature`,
`outputFormat=application/json` and `srsName=EPSG:4326`. The collector requires an exact
one-to-one match with all 98 entries in `src/lib/routing/mtr-catalog.json`. It preserves
the downloaded inventory, catalogue, six raw layers per station, source URLs, retrieval
timestamps, feature counts and SHA-256 checksums. Four station workers retry failed
atomic downloads up to three times. A fresh output directory is required; existing
snapshots are never overwritten.

`collection.json` records completeness and failures. `index.json` associates station
codes and stable upstream venue IDs with uncorrected schema-v1 bundles.
`upload-manifest.json` records the exact file sizes and hashes and the proposed private
development R2 destination:

```text
r2-tijpdata:hype-assets-raw-dev/premises-maps/source-baselines/2026-11-15-initial
```

Prepare/check the upload without writing remotely:

```sh
bash scripts/indoor/upload-mtr-baseline.sh \
  /home/io/.local/state/hype/mtr-baselines/2026-11-15-initial
```

After upload is authorized, the same command with `--apply` copies with `--immutable`
and performs `rclone check --download`. It uses the existing rclone credentials. It does
not delete remote objects or change database pointers.

The validator checks every manifest checksum and applies `validateMapBundle` to all
bundles. A collected source archive is not a published station map: the baseline
deliberately contains no inferred connections, occupancies, corrections or
official-document associations. These require subsequent review. Source layer files
retain publisher text and geometry byte for byte.

This archive prefix is separate from runtime
`premises-maps/{mapId}/releases/{sha256}.json` objects. Subsequent import/editor work
must retain each uncorrected bundle under its release hash and use that hash as the
correction baseline; uploading this archive alone does not register or publish maps.
Existing curated maps and their correction baselines are preserved.

## Initial collection result — 15 November 2026

Completed all 98 stations with no collection failures. The package contains 789 files
totaling 169,421,175 bytes (161.6 MiB), including its upload manifest. All 788
manifested payload files passed SHA-256 verification and all 98 bundles passed the
application release validator.

| Layer     | Features |
| --------- | -------: |
| Venues    |       98 |
| Levels    |      678 |
| Units     |    9,122 |
| Openings  |   18,480 |
| Amenities |    9,520 |
| Occupants |    1,838 |

The upload dry run passed for all 789 files. No remote objects were written; the remote
baseline prefix remained empty after verification. Evidence is retained at
`/home/io/.local/state/hype/mtr-baselines/2026-11-15-initial-upload-dry-run.log`.
