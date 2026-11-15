# MTR catalogue artwork

The logo library belongs to the shared brand and corporate-group catalogue. Artwork and
research evidence live in immutable catalogue revisions; no database migration is needed
because revision content is validated JSON.

## Logo library

Open [the local catalogue](http://localhost:4173/admin/catalogue). The logo library
shows each image, its readable variant name, a compact file-format label and an optional
source link. Uploading and saving artwork makes it active without a separate approval
step. Research notes and diagnostic previews belong in `.research/catalogue/mtr/`, not
in the application interface. Existing theme-specific artwork takes precedence.

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
`CatalogueMarkerArtwork` component renders that treatment. Marker derivatives are
maintained separately from general logo sources.

Saving a general logo also updates the existing `logo` projection so catalogue consumers
receive the approved asset. Accepted Location snapshots retain their pinned identity
versions; this import does not relink Locations or bulk publish to them.

## Reproducible local import

Tracked research manifests:

- `scripts/catalogue/mtr-brands.json`: named cohort and taxonomy mapping.
- `scripts/catalogue/mtr-groups.json`: evidenced group hierarchy; `parentCandidate` in
  the brand roster is a research lead and is never an import instruction.
- `scripts/catalogue/mtr-artwork-selection.json`: visually inspected selections, pinned
  by source URL and SHA-256. Payment badges, hosting-provider marks and unrelated
  subsidiary logos are excluded.

Originals, website snapshots, SVGs, normalised PNGs and receipts belong in the ignored
`.research/catalogue/mtr/` folder. Raster candidates are normalised onto a 512 × 512
canvas using their reviewed solid background, without generating marker artwork. White
vector marks retain an explicit dark background; the source paths are unchanged. Raster
originals are never enlarged. New raster uploads require at least 512 pixels on the
original longest edge. Existing sourced logos are active, including those still awaiting
a higher-resolution replacement. Self-contained SVG drawing sources retain their vector
geometry. Cards and profile images use theme, light/dark and generic variants. Existing
curated Breadline SVGs remain available for Milque. Tenant-supplied mall logos retain
their source provenance. Activation does not represent licensing approval.

From the Hype Git root:

```sh
python3 scripts/catalogue/fetch-mtr-artwork.py
# Optional positional codes restrict a retry to those entities.
python3 scripts/catalogue/prepare-mtr-artwork.py
dev-check bun scripts/catalogue/import-mtr-local.ts
dev-check bun scripts/catalogue/import-mtr-local.ts --apply
# Refresh retained candidate slots with the selected sources:
dev-check bun scripts/catalogue/import-mtr-local.ts --apply --refresh-candidates
# Activate sourced entries and remove research-only variants from current records:
dev-check bun scripts/catalogue/import-mtr-local.ts --apply --activate-artwork
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
admin authentication, active image loading, compact labels, editable controls, removal
of research UI and preservation of the themed 7-Eleven logo.

## Higher-quality source review

The source-quality pass replaces 32 of the 43 undersized raster selections: 20 with SVGs
and 12 with larger native rasters. The prepared library contains 57 assets, including 23
SVGs. Sourced logos are active in the local catalogue. Existing approved artwork,
including the general and Milque 7-Eleven SVGs, remains selected and unchanged.

Official sources include A-1 Bakery, Café de Coral and Super Super, Fotomax, Global
Exchange, M&S, MOS Burger, Giordano International, Oniverse and HSBC. Pinned secondary
archives supply several standalone marks; their URLs remain recorded for review.
Fotomax's inline `logo` symbol is reproducibly extracted from its official page.
Non-rendering SVG editor metadata is removed before strict drawing-markup validation. No
raster is enlarged to satisfy the source-resolution requirement.

Ten active logos still need better sources: Berlin Optical, Comvita, Green Dot Dot,
Italian Tomato, Juewei, Max Sight, Maxim's Cakes, Tong Kee Bao Dim, MOS Food Services
and China-Hongkong Photo. Some retrieved images were unrelated marks, certification
badges or anniversary variants and were excluded. Joint Host's Manus hosting favicon is
withdrawn from the active candidate slot; its source bytes and catalogue revision remain
available. A correctly attributed Joint Host logo is still unresolved.

Ignored research evidence is in `better-source-selection.json`, the source-page folders,
and `better-source-verification.json` under `.research/catalogue/mtr/`. Source URLs and
SHA-256 pins remain tracked in the selection manifest. Local HTTP verification checks
MIME types and checksums for the 56 prepared replacement assets, plus availability of
both restored 7-Eleven SVGs. Marker designs are outside this source-import workflow.

## Group source quality

The group-source pass adds seven logos and upgrades seven existing assets. Eleven
updates use SVG; the other originals are AS Watson (1622 × 470), Veeko (820 × 409) and
China-Hongkong Photo (850 × 850). Current sources and hashes are pinned in the selection
manifest. Five SVG upgrades use the existing curated masters for Maxim's Group,
Convenience Retail Asia, HSH, Wooloomooloo and JC; these are app treatments, not newly
sourced official corporate marks. Their existing artwork is preserved.

All fourteen updates are active locally. The import touches only each group's general
logo and retains other variants, identity data and immutable history. The group-specific
plan, guarded importer, receipts and complete format audit remain under the ignored
`.research/catalogue/mtr/` directory (`group-selected.json`, `apply-group-logos.ts`,
`group-receipt.json` and `group-quality-after.json`). HTTP MIME types and checksums are
verified against the prepared assets.

MOS Food Services still needs a higher-resolution corporate mark: its 114px original is
insufficient even though the prepared canvas is 512px. Hyakunousha, CEC International
and Ten Ren still lack a verified group logo. Blossom also has no logo; its identity
needs a confirmed source before artwork can be assigned. Test identities are excluded
from the sourcing cohort. No small raster is enlarged and reported as a quality upgrade.

User-selected group artwork is retained under
`.research/catalogue/mtr/user-group-artwork/`. CEC International uses a generated 1254px
app treatment based on the supplied CEC-Coils reference; it is not represented as
official corporate artwork. MOS Food Services uses only the three M paths from the
supplied Wikimedia SVG, with the lettering removed. Hyakunousha and Ten Ren use the
exact supplied 200px and 327px images without upscaling; these user-selected originals
remain below the preferred source-resolution threshold. The guarded local installation
and receipts are `apply-user-group-logos.ts` and `user-group-receipt.json`. Blossom is
archived. Test identities are excluded from logo sourcing.
