# Hub title card reference

The November 2026 title cards establish a shared HYPE.HK visual language for hubs: bold
white names, dark backgrounds, angular spirals and geometric paths, with a distinct
palette and pattern for each hub.

## Approved cards

| Hub            | Card                                        | Direction                            |
| -------------- | ------------------------------------------- | ------------------------------------ |
| HYPE.HK        | [hype-hk.png](v2/hype-hk.png)               | Pink–violet square spirals           |
| HK Ghost Signs | [hk-ghost-signs.png](v2/hk-ghost-signs.png) | Fading lavender frames               |
| Breadline      | [breadline.png](v2/breadline.png)           | Coral ribbons with lavender and mint |
| MappingHK      | [mappinghk.png](v2/mappinghk.png)           | Mint grid with violet blocks         |
| DimGaai        | [dimgaai.png](v2/dimgaai.png)               | Jade and amber street-sign paths     |

The current cards use the recomposed 5:4 artwork. The
[upload receipt](v2/upload-receipt.json) and
[DimGaai receipt](v2/dimgaai-upload-receipt.json) record source hashes, image IDs,
storage keys, and prior assignments. All five assignments were verified in production
and the normal local database on 2026-11-06. The earlier landscape versions remain in
`v1/` as design history.

## Local asset delivery

A production database mirror retains each image's `env = production` and its hub
assignment. It does not copy R2 objects. When the separate asset worker runs with
`workers/asset-service/wrangler.local.toml`, its production bucket is simulated local
storage, so it also needs the approved originals. Missing originals produce image errors
and geometric fallback cards even when database assignments are correct.

Restore these five originals without changing database assignments or remote R2:

```sh
dev-check bun run scripts/dev/prepare-hub-artwork.ts --apply
```

Omit `--apply` to inspect missing objects. The helper verifies receipt hashes, rejects
conflicting local objects, and reads back saved bytes. It targets
`.wrangler/state/asset-service/v3`, matching the asset worker's
`--persist-to .wrangler/state/asset-service` setting. Reload the hub page after repair
so cards retry their original image URLs. This is unnecessary when the local asset
worker uses the normal configuration with remote R2 bindings.

## Prompts and future hubs

[Current prompts](v2/prompts.json) preserve the 5:4 compositions, including DimGaai.
[prompts.json](v1/prompts.json) preserves the complete original Imagegen prompts.
[breadline-v2-prompt.json](v1/breadline-v2-prompt.json) preserves the approved edit that
removed the HYPE.HK wordmark and logo. [breadline.png](v1/breadline.png) is the
superseded original, retained only as generation history.

Use an approved card as a visual reference and adapt the matching original prompt:

- Include the hub's exact name as the only text. Do not add a HYPE.HK wordmark, logo,
  handle, or slogan to other hubs.
- Keep the bold typography, dark negative space, angular geometry, and landscape
  composition consistent across the family.
- Give each hub its own geometric rhythm and accent palette. Breadline's warmer
  direction is an explicitly approved reference.
- Check name accuracy, legibility, and composition before uploading. Save new versions
  alongside their prompts rather than overwriting the reference set.

These images were generated and edited with the built-in Imagegen tool.
