<script lang="ts" generics="T extends ResourceIndexEntity">
import type { Snippet } from 'svelte'
import type { ResourceIndexRowSelectionState } from '$lib/types'

type ResourceIndexEntity = { id: string }

type ResourceTableRowProps<T extends { id: string }> = {
  entity: T
  index: number
  row?: Snippet<[T, number, ResourceIndexRowSelectionState | null, boolean]>
  selectionState?: ResourceIndexRowSelectionState | null
  onSelectionToggle?: (entity: T) => void
}

let {
  entity,
  index,
  row,
  selectionState = null,
  onSelectionToggle,
}: ResourceTableRowProps<T> = $props()

const isSelectionModeActive = $derived(Boolean(onSelectionToggle))

function handleMouseDownCapture(event: MouseEvent): void {
  if (!onSelectionToggle) return
  event.preventDefault()
}

function handleClickCapture(event: MouseEvent): void {
  if (!onSelectionToggle) return
  event.preventDefault()
  event.stopPropagation()
  onSelectionToggle(entity)
}

function handleKeyDownCapture(event: KeyboardEvent): void {
  if (!onSelectionToggle) return
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') return

  event.preventDefault()
  event.stopPropagation()
  onSelectionToggle(entity)
}
</script>

<div
  class="px-2"
  onmousedowncapture={handleMouseDownCapture}
  onclickcapture={handleClickCapture}
  onkeydowncapture={handleKeyDownCapture}
>
  {#if row}
    {@render row(entity, index, selectionState, isSelectionModeActive)}
  {:else}
    <div
      class="bits-resource-index__fallback-row"
      data-entity-index={index}
      data-selection-state={selectionState}
    >
      <span class="bits-resource-index__fallback-title">{entity.id}</span>
    </div>
  {/if}
</div>
