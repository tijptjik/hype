# Breadline corporate group treatments

Seven standalone SVG masters, using the brand set’s 128 × 128 viewBox, cream rim, muted
palette and transparent corners. Marks use vector geometry without fonts, scripts,
raster embeds or external resources. These are app-specific interpretations, not
official replacement corporate logos.

The catalogue upload API accepts PNG. The installer renders these masters at 512 × 512
and saves them through the authenticated catalogue editor, preserving the normal
revision history. Existing attached logos are skipped unless their codes are explicitly
passed as arguments to the installer; replacement receipts retain the previous image
URLs. Run with the local admin persona and the managed runner:

```sh
dev-remote --port 4173 chrome bun scripts/visual-checks/install-breadline-group-logos.ts
```

## Sources and interpretation

References retrieved 12 November 2026 are retained in
`docs/design/breadline-group-review/sources/`. The preview board is
`docs/design/breadline-group-review/treatments.png`.

- CRA: consistently weighted, outlined bold lettering replaces the uneven hand-drawn
  initials, retaining the softened corporate red oval. The CRA abbreviation is an app
  treatment; the reference is https://www.cr-asia.com/eng/images/global/logo.gif
- DFI: official DFI vector, with muted blue and the temporary 140-year anniversary
  lockup removed. https://www.dfiretailgroup.com/media/sbhii0fg/dfi_140_blue_en.svg
- JC: outline reconstruction of the supplied double-stroke JC mark, preserving its tall
  stems and sweeping tapered curves, in cream on olive. The user-supplied mark replaces
  the earlier generic monogram.
- Maxim’s Group: the M is isolated as a connected shape from the supplied corporate
  wordmark and vector-traced, preserving its outline and orientation. Uniform scaling
  and recolouring only; no redrawn strokes, added underline or mirrored geometry. Source
  copy: https://upload.wikimedia.org/wikipedia/commons/a/a0/Maxims_Logo.jpg The isolated
  outline is retained in `sources/maxims-m-outline.svg`.
- HSH: original vector crown and shield paths, including the lion, three fleurs-de-lis
  and original divisions. Ribbon and separate corporate text are omitted so the crest
  can render larger; no replacement heraldic geometry. Reference:
  https://upload.wikimedia.org/wikipedia/en/8/81/Hongkong_and_Shanghai_Hotels_logo.svg
- Yamazaki Baking: traced official sun silhouette and face with the original curved
  rays, eye positions, angled nose and smile. Source:
  https://www.yamazaki.hk/favicon.png (retained as `sources/yamazaki-sun.png`).
- Wooloomooloo Group: shared dotted W treatment, confirmed against the group wordmark:
  https://www.wooloo-mooloo.com/wp-content/uploads/2024/01/cropped-WMG_Hlogo_whiteBG.jpg

Corporate marks remain the property of their respective owners. Reference files are
research inputs; only the normalized SVG treatments are served from `static/`.

## Verification

The five requested replacements were installed through the local catalogue editor
(`job-8nTXAfhCxV`), retaining their previous image URLs in
`docs/design/breadline-group-review/v2/replacement-receipts.json`. All seven saved
catalogue PNGs passed the SVG pixel-comparison check in authenticated managed Chrome
(`job-FmQn8U7Unb`). Current evidence and previews are in
`docs/design/breadline-group-review/v2/`; the root preview and catalogue screenshot also
show the updated artwork. The 390px check reaches the existing admin minimum-width
screen (1200px), rather than a mobile catalogue layout.
