<script lang="ts">
// ICONS
import ArrowRightIcon from 'virtual:icons/proicons/arrow-right'
let {
  incoming,
  existing,
  current,
  label,
  disabled = false,
  onToggle,
}: {
  incoming: unknown
  existing: unknown
  current: unknown
  label: string
  disabled?: boolean
  onToggle: (importing: boolean) => void
} = $props()
const equal = $derived(
  JSON.stringify(incoming) === JSON.stringify(current) &&
    JSON.stringify(incoming) === JSON.stringify(existing),
)
const imported = $derived(
  !equal && JSON.stringify(incoming) === JSON.stringify(current),
)
</script>
<button
  type="button"
  class="border-border text-foreground hover:bg-primary/10 focus-visible:outline-primary data-[import-state=imported]:border-primary/40 data-[import-state=imported]:bg-primary/10 data-[import-state=imported]:text-primary mx-auto flex size-9 shrink-0 items-center justify-center self-center rounded-full border focus-visible:outline-2 disabled:border-transparent disabled:opacity-60"
  disabled={disabled || equal}
  aria-pressed={imported}
  aria-label={`${imported ? 'Undo import' : 'Import'} ${label}`}
  data-import-state={equal ? 'equal' : imported ? 'imported' : 'ignored'}
  onclick={() => onToggle(!imported)}
>
  {#if equal}
    <span aria-hidden="true">=</span>
  {:else if imported}
    <ArrowRightIcon class="size-4" />
  {:else}
    <span aria-hidden="true">—</span>
  {/if}
</button>
