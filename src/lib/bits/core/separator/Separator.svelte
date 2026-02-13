<script lang="ts">
import { Separator as SeparatorPrimitive } from 'bits-ui'
// TYPES
import type { SeparatorProps } from './separator.types'

let {
  orientation = 'horizontal',
  decorative = false,
  class: className = '',
  ...restProps
}: SeparatorProps = $props()

const classes = $derived(['bits-separator', className].filter(Boolean).join(' '))
</script>

<SeparatorPrimitive.Root {orientation} {decorative} class={classes} {...restProps} />
