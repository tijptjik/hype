<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import { cx } from '$lib/bits/utils'

type GenericGridLayoutColumns = 1 | 2 | 3

type Props = {
  class?: string
  children?: Snippet
  layoutColumns?: GenericGridLayoutColumns
}

const CARD_GRID_GAP_PX = 16
const BASE_GRID_BREAKPOINTS = {
  twoColumns: 1152,
  threeColumns: 1662,
  fourColumns: 2174,
} as const

let { class: className = '', children, layoutColumns = 2 }: Props = $props()

const responsiveCtx = getResponsiveCtx()

function scaleBreakpoint(baseWidth: number, span: GenericGridLayoutColumns): number {
  const singleColumnWidth = (baseWidth - CARD_GRID_GAP_PX) / 2
  return Math.round(singleColumnWidth * span + CARD_GRID_GAP_PX * (span + 2))
}

const columns = $derived.by(() => {
  const width = responsiveCtx.main.width
  const twoColumnsBreakpoint = scaleBreakpoint(
    BASE_GRID_BREAKPOINTS.twoColumns,
    layoutColumns,
  )
  const threeColumnsBreakpoint = scaleBreakpoint(
    BASE_GRID_BREAKPOINTS.threeColumns,
    layoutColumns,
  )
  const fourColumnsBreakpoint = scaleBreakpoint(
    BASE_GRID_BREAKPOINTS.fourColumns,
    layoutColumns,
  )

  if (width >= fourColumnsBreakpoint) return 4
  if (width >= threeColumnsBreakpoint) return 3
  if (width >= twoColumnsBreakpoint) return 2
  return 1
})

const gridClass = $derived(cx('grid items-start gap-4', className))
const gridStyle = $derived(`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`)
</script>

<div class={gridClass} style={gridStyle}>{@render children?.()}</div>
