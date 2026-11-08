<script lang="ts">
// BITS-UI
import { Popover as PopoverPrimitive } from 'bits-ui'
// TYPES
import type { PopoverProps } from './popover.types'

let {
  open = $bindable(false),
  trigger,
  children,
  triggerProps = {},
  triggerClass = '',
  contentProps = {},
  contentClass = '',
  ...restProps
}: PopoverProps = $props()

const popoverTriggerClass = $derived(
  ['bits-theme', triggerClass].filter(Boolean).join(' '),
)

const popoverContentClass = $derived(
  ['bits-theme', contentClass].filter(Boolean).join(' '),
)
</script>

<PopoverPrimitive.Root bind:open {...restProps}>
  <PopoverPrimitive.Trigger {...triggerProps}>
    {#snippet child({ props })}
      <div {...props} class={popoverTriggerClass}>{@render trigger()}</div>
    {/snippet}
  </PopoverPrimitive.Trigger>

  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      {...contentProps}
      class={popoverContentClass}
      sideOffset={contentProps.sideOffset ?? 8}
    >
      {@render children?.()}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
</PopoverPrimitive.Root>
