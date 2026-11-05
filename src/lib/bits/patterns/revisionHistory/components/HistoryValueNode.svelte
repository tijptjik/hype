<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// COMPONENTS
import HistoryValueNode from './HistoryValueNode.svelte'
// TYPES
import type { RevisionValue } from '#lib/revisions/value.js'

let {
  name,
  value,
  depth = 0,
  expandAllToken = 0,
}: {
  name: string
  value: RevisionValue
  depth?: number
  expandAllToken?: number
} = $props()
const structured = $derived(value !== null && typeof value === 'object')
const children = $derived(
  value !== null && typeof value === 'object' ? Object.entries(value) : [],
)
const expandable = $derived(children.length > 0)
const type = $derived(
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
)
let expanded = $state(untrack(() => depth === 0))

$effect(() => {
  if (expandAllToken > 0) expanded = true
})
</script>

<div class="min-w-0">
  {#snippet label()}
    <span class="flex min-w-0 items-start gap-2">
      <span
        class="border-border/60 mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm border font-mono text-xs leading-none"
        class:invisible={!expandable}
        aria-hidden="true"
        >{expanded ? '−' : '+'}</span
      >
      <code
        class="min-w-0 font-mono text-xs font-medium [overflow-wrap:anywhere] whitespace-normal"
        >{name}</code
      >
    </span>
  {/snippet}
  {#if expandable}
    <button
      type="button"
      class="hover:bg-primary/3 focus-visible:outline-primary grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      onclick={() => (expanded = !expanded)}
    >
      {@render label()}
      <span class="text-muted-foreground min-w-0 text-xs"
        >{type}
        · {children.length}
        {type === 'array'
          ? children.length === 1
            ? 'item'
            : 'items'
          : children.length === 1
            ? 'field'
            : 'fields'}</span
      >
    </button>
  {:else}
    <div
      class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 px-3 py-2.5"
    >
      {@render label()}
      <span class="min-w-0 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap"
        >{structured
          ? Array.isArray(value)
            ? '[]'
            : '{}'
          : value === null
            ? 'null'
            : value === ''
              ? '""'
              : String(value)}</span
      >
    </div>
  {/if}
  {#if expandable && expanded}
    <div class="border-border/40 bg-primary/2 ml-3 min-w-0 border-t border-l">
      <div class="divide-border/30 divide-y">
        {#each children as [childName, childValue] (childName)}
          <HistoryValueNode
            name={childName}
            value={childValue}
            depth={depth + 1}
            {expandAllToken}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>
