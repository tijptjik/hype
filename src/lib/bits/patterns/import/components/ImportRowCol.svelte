<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportRowColProps } from './importLayout.types'

const spanClasses: Record<NonNullable<ImportRowColProps['span']>, string> = {
  1: '',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
}

let { children, span = 1, class: className = '' }: ImportRowColProps = $props()

const rootClass = $derived(cx(spanClasses[span], className))
</script>

<div class={rootClass}>
  {@render children?.()}
</div>
