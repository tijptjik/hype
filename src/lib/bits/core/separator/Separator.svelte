<script lang="ts">
import { Separator as SeparatorPrimitive } from 'bits-ui'
// ICONS
import Dot from 'virtual:icons/lucide/dot'
// STYLES
import { cx } from '$lib/bits/utils'
// TYPES
import type { SeparatorProps } from './separator.types'

let {
  orientation = 'horizontal',
  decorative = false,
  variant = 'default',
  class: className = '',
  ...restProps
}: SeparatorProps = $props()

const classes = $derived(
  cx(
    'shrink-0',
    variant === 'dot'
      ? 'mx-2 my-0 inline-flex h-9 w-9 items-center justify-center self-center bg-transparent text-base-content/75'
      : [
          'bg-border my-4',
          orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        ],
    className,
  ),
)
</script>

<SeparatorPrimitive.Root {orientation} {decorative} class={classes} {...restProps}>
  {#if variant === 'dot'}
    <Dot class="h-full w-full block text-secondary" aria-hidden="true" />
  {/if}
</SeparatorPrimitive.Root>
