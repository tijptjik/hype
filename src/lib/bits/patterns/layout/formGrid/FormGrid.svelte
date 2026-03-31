<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// BITS
import { cx } from '$lib/bits/utils'

type Props = {
  class?: string
  children?: Snippet
  minWidth?: number
}

const CARD_GRID_GAP_PX = 16
const MAX_GRID_COLUMNS = 4
const DEFAULT_CARD_MIN_WIDTH_PX = 320

let {
  class: className = '',
  children,
  minWidth = DEFAULT_CARD_MIN_WIDTH_PX,
}: Props = $props()

let containerWidth = $state(0)

const columns = $derived.by(() => {
  const width = containerWidth
  const nextColumns = Math.floor(
    (width + CARD_GRID_GAP_PX) / (minWidth + CARD_GRID_GAP_PX),
  )

  return Math.max(1, Math.min(MAX_GRID_COLUMNS, nextColumns))
})

const gridClass = $derived(cx('grid items-start gap-4', className))
const gridStyle = $derived(`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`)
</script>

<div bind:clientWidth={containerWidth} class={gridClass} style={gridStyle}>
  {@render children?.()}
</div>
