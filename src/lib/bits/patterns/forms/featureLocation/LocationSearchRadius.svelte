<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
let {
  value = $bindable(50),
  disabled = false,
  compact = false,
  onchange,
}: {
  value?: number
  disabled?: boolean
  compact?: boolean
  onchange?: () => void
} = $props()
</script>
<label
  class={compact
    ? 'border-border bg-panel text-foreground grid h-10 w-52 shrink-0 grid-cols-[1fr_auto] items-center gap-x-2 rounded-md border px-3 py-1 text-xs'
    : 'border-border bg-panel text-foreground flex w-52 shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm'}
>
  {m.feature_location_radius()}<output class="tabular-nums">{value} m</output>
  <input
    type="range"
    min="50"
    max="1000"
    step="50"
    bind:value
    {onchange}
    {disabled}
    aria-label={m.feature_location_radius()}
    class={compact
      ? 'accent-primary col-span-2 h-2 w-full cursor-pointer'
      : 'accent-primary h-4 w-full cursor-pointer'}
  >
</label>
