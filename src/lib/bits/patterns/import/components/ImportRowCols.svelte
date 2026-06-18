<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// COMPONENTS
import ImportRow from './ImportRow.svelte'
// TYPES
import type { ImportRowColsProps } from './importLayout.types'

const colClasses: Record<NonNullable<ImportRowColsProps['cols']>, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
  9: 'lg:grid-cols-9',
  10: 'lg:grid-cols-10',
  11: 'lg:grid-cols-11',
  12: 'lg:grid-cols-12',
}

let {
  children,
  cols = 1,
  class: className = '',
  contentClass = '',
}: ImportRowColsProps = $props()

const gridClass = $derived(cx('grid grid-cols-1 gap-4', colClasses[cols], contentClass))
</script>

<ImportRow class={className} contentClass="p-4">
  <div class={gridClass}>
    {@render children?.()}
  </div>
</ImportRow>
