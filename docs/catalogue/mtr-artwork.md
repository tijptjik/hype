# MTR catalogue artwork

The logo library belongs to the shared brand and corporate-group catalogue. Artwork and
research evidence live in immutable catalogue revisions; no database migration is needed
because revision content is validated JSON.

## Review

Open [the local catalogue](http://localhost:4173/admin/catalogue). Each profile has a
Logo library with candidate previews, source links and approval controls. Edit, approve
and save an entry to publish its general logo. Candidate artwork is visible in the admin
catalogue but excluded from public marker selection. Existing published logos remain
available while replacements are reviewed.

The initial cohort is the 60 named brands in the Kennedy Town and Hong Kong indoor
station datasets. Generic kiosk identifiers and service placeholders are excluded. The
current MTR directories contain additional tenants; those are not silently merged with
this indoor snapshot. Directory evidence:

- [Kennedy Town](https://www.mtr.com.hk/en/customer/shops/shop_search.php?query_type=search&start=83)
- [Hong Kong](https://www.mtr.com.hk/en/customer/shops/shop_search.php?query_type=search&start=39)

MTR's broad shop types are mapped to existing Hype categories. The roster retains
station/unit occurrences and original categories. A shop listing proves a station
association, not corporate ownership. Only evidenced parent links are imported;
franchise operators are not substituted for trademark owners. A missing parent link
means unconfirmed, not necessarily independent. Existing curated membership is
preserved.

## Artwork contract

Use `logo` for the general solid-background artwork. Marker slots are `marker`,
`marker-light`, `marker-dark`, and `marker-{theme-code}` (for example
`marker-null-space` or `marker-milk`). All slots retain their background colour, review
status, source URL and optional attribution, licence and notes.

`resolveCatalogueMarker` selects approved theme artwork, then mode artwork, then the
default marker. If those are absent it selects the approved general logo, existing
published logo or supplied generic icon, with a white ring. The reusable
`CatalogueMarkerArtwork` component renders that treatment. The editor includes a
fallback preview. Actual marker derivatives and integration into the map marker pipeline
are deliberately deferred until source-artwork review.

Approving a general logo also updates the existing `logo` projection so catalogue
consumers receive the approved asset. Accepted Location snapshots retain their pinned
identity versions; this import does not relink Locations or bulk publish to them.

## Reproducible local import

Tracked research manifests:

- `scripts/catalogue/mtr-brands.json`: named cohort and taxonomy mapping.
- `scripts/catalogue/mtr-groups.json`: evidenced group hierarchy; `parentCandidate` in
  the brand roster is a research lead and is never an import instruction.
- `scripts/catalogue/mtr-artwork-selection.json`: visually inspected selections, pinned
  by source URL and SHA-256. Payment badges, hosting-provider marks and unrelated
  subsidiary logos are excluded.

Originals, website snapshots, normalised PNGs and receipts belong in the ignored
`.research/catalogue/mtr/` folder. Source candidates are normalised onto a white 512 ×
512 canvas, without generating marker artwork. Small originals are labelled as low
resolution; upscaling does not restore detail. Tenant-supplied mall logos retain the
mall page and image provenance. Candidate status does not represent licensing approval.

From the Hype Git root:

```sh
python3 scripts/catalogue/fetch-mtr-artwork.py
# Optional positional codes restrict a retry to those entities.
python3 scripts/catalogue/prepare-mtr-artwork.py
dev-check bun scripts/catalogue/import-mtr-local.ts
dev-check bun scripts/catalogue/import-mtr-local.ts --apply
```

The importer accepts no remote target. It opens `wrangler.local.toml` with remote
bindings disabled and writes to local D1 and `ASSET_PUBLIC_DEV`. Existing identities are
matched by exact kind/code; new identities use deterministic IDs. Writes use the normal
revision service and expected-version guards. Existing logos, reviewed artwork,
translations and curated categories are preserved. Assets have deterministic immutable
UUIDs and conflicting bytes are rejected. A rerun resumes an interrupted import.

Review the ignored `prepared-artwork.json`, `import-receipt.json` and `coverage.json`
for exact asset coverage and unresolved research. Do not infer corporate ownership from
similar names, store operators or directory category labels.

## Verification

Focused selector tests are in `src/tests/catalogue-artwork.test.ts`. The managed Chrome
interaction check is `tests/e2e/catalogue-artwork/artwork.spec.mjs`; it asserts local
admin authentication, image loading, provenance visibility, candidate exclusion and
white-ring preview without publishing approvals.
