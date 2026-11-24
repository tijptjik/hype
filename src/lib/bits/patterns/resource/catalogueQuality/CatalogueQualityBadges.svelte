<script lang="ts">
// DOMAIN
import { catalogueQuality, LOGO_QUALITIES } from '#lib/locations/catalogueQuality.js'
import type { CatalogueArtworkOwner } from '#lib/locations/catalogueArtwork.js'
let { record }: { record: CatalogueArtworkOwner } = $props()
const quality = $derived(catalogueQuality(record))
</script>
<div class="flex flex-wrap gap-1">
  {#each LOGO_QUALITIES as item (item.key)}
    <span
      role="img"
      class="rounded border px-1 py-0.5 text-[9px] leading-none"
      class:text-success={quality[item.key]}
      class:opacity-40={!quality[item.key]}
      title={`${item.label}: ${quality[item.key] ? 'Yes' : 'No'}. ${item.description}`}
      aria-label={`${item.label}: ${quality[item.key] ? 'Yes' : 'No'}`}
      >{item.badge}</span
    >
  {/each}
</div>
