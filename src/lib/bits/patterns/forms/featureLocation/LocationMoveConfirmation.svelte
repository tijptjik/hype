<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import WarningIcon from 'virtual:icons/lucide/triangle-alert'

let {
  distance,
  kind = 'building',
  onConfirm,
  onCancel,
  confirmButton = $bindable(),
}: {
  distance: number
  kind?: 'building' | 'address'
  onConfirm: () => void
  onCancel: () => void
  confirmButton?: HTMLButtonElement
} = $props()
</script>

<div
  class="border-warning bg-panel text-foreground flex max-w-sm flex-col gap-2 rounded-lg border p-3 text-sm shadow-lg"
  role="alert"
  data-building-move-warning={kind === 'building' ? '' : undefined}
  data-address-move-warning={kind === 'address' ? '' : undefined}
>
  <span class="flex items-start gap-2"
    ><WarningIcon class="text-warning size-5 shrink-0" aria-hidden="true" />
    {kind === 'building'
      ? m.feature_search_building_move({ distance: Math.round(distance) })
      : m.address_map_move_notice({ distance: Math.round(distance) })}</span
  >
  <div class="flex flex-wrap gap-2">
    <button
      bind:this={confirmButton}
      type="button"
      class="bg-primary text-primary-content focus-visible:outline-primary rounded-md px-3 py-2 font-medium focus-visible:outline-2"
      onclick={onConfirm}
    >
      {kind === 'building'
        ? m.feature_search_confirm_building()
        : m.address_map_confirm_move()}
    </button>
    <button
      type="button"
      class="hover:bg-muted focus-visible:outline-primary rounded-md px-3 py-2 focus-visible:outline-2"
      onclick={onCancel}
    >
      {m.cancel()}
    </button>
  </div>
</div>
