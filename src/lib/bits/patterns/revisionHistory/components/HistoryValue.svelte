<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// COMPONENTS
import HistoryValueNode from './HistoryValueNode.svelte'
// TYPES
import type { RevisionSlot } from '#lib/revisions/value.js'

let { slot, path = [] }: { slot: RevisionSlot; path?: readonly string[] } = $props()
const structured = $derived(
  slot.present && slot.value !== null && typeof slot.value === 'object',
)
let expandAllToken = $state(0)
const children = $derived(
  slot.present && slot.value !== null && typeof slot.value === 'object'
    ? Object.entries(slot.value)
    : [],
)

/** Formats scalar evidence without conflating absent, null and empty values.
 * @param value Before or after revision slot.
 * @returns Readable scalar text, preserving whitespace in strings.
 */
function display(value: RevisionSlot): string {
  if (!value.present) return 'Not set'
  if (value.value === null) return 'Empty'
  if (typeof value.value === 'boolean') return value.value ? 'Enabled' : 'Disabled'
  if (typeof value.value === 'string') {
    if (path.at(-1) === 'presentationMode') {
      if (value.value === 'cover') return m.gallery__presentation_cover()
      if (value.value === 'contain') return m.gallery__presentation_blur()
      if (value.value === 'cast-edges') return m.gallery__presentation_edges()
    }
    return value.value || 'Empty text'
  }
  if (path.at(-1) === 'rotation' && typeof value.value === 'number')
    return `${value.value}°`
  return String(value.value)
}
</script>

{#if structured}
  <div
    class="border-border/50 w-full min-w-0 self-start overflow-hidden rounded-md border"
  >
    <div
      class="border-border/50 bg-primary/3 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs"
    >
      <span class="text-muted-foreground font-mono"
        >{slot.present && Array.isArray(slot.value) ? 'array' : 'object'}
        · {children.length}
        {slot.present && Array.isArray(slot.value)
          ? children.length === 1
            ? 'item'
            : 'items'
          : children.length === 1
            ? 'field'
            : 'fields'}</span
      >
      {#if children.some(([, value]) => value !== null && typeof value === 'object')}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground focus-visible:outline-primary rounded-sm px-1 focus-visible:outline-2"
          onclick={() => expandAllToken++}
        >
          Expand all
        </button>
      {/if}
    </div>
    <div class="divide-border/40 divide-y">
      {#each children as [name, value] (name)}
        <HistoryValueNode {name} {value} {expandAllToken} />
      {/each}
    </div>
  </div>
{:else}
  <span
    class="min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
    >{display(slot)}</span
  >
{/if}
