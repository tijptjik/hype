<script lang="ts">
import { Separator as SeparatorPrimitive } from 'bits-ui'
// ICONS
import Dot from 'virtual:icons/lucide/dot'
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
  ['bits-separator', `bits-separator--variant-${variant}`, className]
    .filter(Boolean)
    .join(' ')
)
</script>

<SeparatorPrimitive.Root {orientation} {decorative} class={classes} {...restProps}>
  {#if variant === 'dot'}
    <Dot class="bits-separator__dot-icon text-secondary" aria-hidden="true" />
  {/if}
</SeparatorPrimitive.Root>
