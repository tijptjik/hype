<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'

type NeighbourhoodRow = {
  id: string
  count: number
  selected: boolean
  name: string
  level: number | null
}
let { row, onToggle }: { row: NeighbourhoodRow; onToggle: (id: string) => void } =
  $props()
</script>

{#if row.count > 0}
  <button
    type="button"
    class="group ml-4 flex w-[calc(100%-1rem)] cursor-pointer items-center justify-between gap-4 rounded-l-md bg-panel py-2 pl-4 pr-7 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-focus"
    aria-pressed={row.selected}
    onclick={() => onToggle(row.id)}
    onkeydown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.closest('section')?.querySelector('input')?.focus()
      }
    }}
    in:slide={{ axis: 'y', duration: 200 }}
    out:slide={{ axis: 'y', duration: 200 }}
  >
    <span class="flex min-w-0 -translate-x-5 items-center gap-3">
      <span
        class="size-2 shrink-0 rounded-full {row.selected
          ? 'bg-primary'
          : 'bg-transparent group-hover:bg-base-content/30'}"
      ></span>
      <span class="flex min-w-0 flex-col">
        {#if row.level !== null}
          <span class="font-mono text-xs text-base-content/60">L{row.level}</span>
        {/if}
        <span class="font-normal text-base-content">{row.name}</span>
      </span>
    </span>
    <span
      class="badge flex size-8 items-center justify-center border-2 border-base-200 bg-transparent font-mono font-bold text-base-content/60"
      >{row.count}</span
    >
  </button>
{/if}
