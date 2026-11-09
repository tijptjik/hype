<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import WarningIcon from 'virtual:icons/lucide/triangle-alert'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { MapAddressDisagreement } from '#lib/addresses/mapAddressDisagreement.js'
let {
  conflicts,
  onAccept,
  onReview,
  onCancel,
  busy = false,
  error = '',
  reviewRequired = false,
}: {
  conflicts: MapAddressDisagreement[]
  onAccept?: () => void
  onReview: () => void
  onCancel?: () => void
  busy?: boolean
  error?: string
  reviewRequired?: boolean
} = $props()
</script>
<div
  class="flex max-w-full overflow-hidden rounded-lg border border-warning/50 bg-panel text-foreground shadow-lg {error
    ? 'w-80'
    : 'w-max max-w-80'}"
  data-map-address-conflict
  aria-busy={busy}
>
  {#if !error}
    <div
      class="border-border/60 flex w-10 shrink-0 items-center justify-center border-r"
    >
      <WarningIcon class="text-warning size-5" aria-hidden="true" />
    </div>
  {/if}
  <div class="flex min-w-0 flex-1 flex-col {error ? 'gap-3 p-3' : 'gap-2 p-2'}">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-semibold">{m.address_map_review_disagreement()}</p>
        {#each conflicts as conflict}
          <p class="text-muted-foreground text-xs">
            {conflict.selected}
            → {conflict.mapped}
          </p>
        {/each}
      </div>
      <div class="flex shrink-0 items-center gap-2">
        {#if error}
          <WarningIcon class="text-warning size-5" aria-hidden="true" />
        {/if}
        {#if onCancel}
          <button
            type="button"
            aria-label={m.address_map_cancel_move()}
            class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-primary flex size-6 items-center justify-center rounded focus-visible:outline-2"
            onclick={onCancel}
          >
            <XIcon class="size-4" aria-hidden="true" />
          </button>
        {/if}
      </div>
    </div>
    {#if error}
      <p role="status" class="text-warning text-xs">{error}</p>
    {/if}
    <div
      class="border-border/60 flex flex-wrap items-center justify-center gap-2 border-t pt-2"
    >
      {#if onAccept && !reviewRequired}
        <button
          type="button"
          disabled={busy}
          class="bg-primary text-primary-content focus-visible:outline-primary rounded-md px-3 py-2 text-xs font-medium hover:brightness-110 focus-visible:outline-2 disabled:opacity-50"
          onclick={onAccept}
        >
          {busy ? m.resource_loading() : m.address_map_accept_change()}
        </button>
      {/if}
      <button
        type="button"
        disabled={busy}
        class="hover:bg-muted focus-visible:outline-primary rounded-md px-3 py-2 text-xs font-medium focus-visible:outline-2 disabled:opacity-50"
        onclick={onReview}
      >
        {m.address_map_review_change()}
      </button>
    </div>
  </div>
</div>
