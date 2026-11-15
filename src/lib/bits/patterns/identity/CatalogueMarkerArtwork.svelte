<script lang="ts">
// DOMAIN
import {
  resolveCatalogueMarker,
  type CatalogueArtworkOwner,
} from '#lib/locations/catalogueArtwork.js'
let {
  owner,
  theme,
  mode,
  genericIcon,
  format,
  label = '',
}: {
  owner: CatalogueArtworkOwner
  theme: string
  mode: 'light' | 'dark'
  genericIcon?: string
  format?: string | Record<string, string>
  label?: string
} = $props()
const asset = $derived(resolveCatalogueMarker(owner, theme, mode, genericIcon, format))
</script>
{#if asset}
  <img
    src={asset.src}
    alt={label}
    data-artwork-slot={asset.slot}
    data-white-ring={asset.whiteRing}
    class="size-full rounded-full object-contain"
    style:background={asset.background}
    style:border={asset.whiteRing ? '3px solid #ffffff' : 'none'}
  >
{/if}
