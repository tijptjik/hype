<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { MapMissingParts } from '#lib/addresses/mapMissingParts.js'
let {
  parts,
  onApply,
  onDismiss,
}: { parts: MapMissingParts; onApply: () => void; onDismiss: () => void } = $props()
const label = $derived([parts.block?.label, parts.number].filter(Boolean).join(' · '))
</script>

<div
  class="border-primary/50 bg-panel text-foreground flex max-w-80 items-stretch overflow-hidden rounded-lg border shadow-lg"
  data-map-address-suggestion
>
  <button
    type="button"
    class="hover:bg-primary/15 focus-visible:outline-primary flex min-w-0 flex-col items-start gap-0.5 px-3 py-2 text-left focus-visible:outline-2"
    onclick={onApply}
  >
    <span class="text-primary text-sm font-medium whitespace-nowrap"
      >{m.address_map_add_missing_parts()}</span
    >
    <span class="text-muted-foreground max-w-60 truncate text-xs">{label}</span>
  </button>
  <button
    type="button"
    aria-label={m.address_map_dismiss_missing_parts()}
    class="text-muted-foreground hover:bg-primary/15 hover:text-foreground focus-visible:outline-primary shrink-0 px-2 focus-visible:outline-2"
    onclick={onDismiss}
  >
    <XIcon class="size-4" />
  </button>
</div>
