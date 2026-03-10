<script lang="ts">
// BITS-UI
import { Tooltip as TooltipPrimitive } from 'bits-ui'
// TYPES
import type { SimpleTooltipProps } from './tooltip.types'

let {
  open = $bindable(false),
  trigger,
  children,
  disabled = false,
  triggerProps = {},
  triggerClass = '',
  contentProps = {},
  contentClass = '',
  arrowClass = '',
  ...restProps
}: SimpleTooltipProps = $props()

const triggerClasses = $derived(
  ['bits-theme', 'bits-tooltip__trigger', triggerClass].filter(Boolean).join(' '),
)

const contentClasses = $derived(
  ['bits-theme', 'bits-tooltip__content', contentClass].filter(Boolean).join(' '),
)

const arrowClasses = $derived(
  ['bits-theme', 'bits-tooltip__arrow', arrowClass].filter(Boolean).join(' '),
)
</script>

{#if disabled || !children}
  {@render trigger()}
{:else}
  <TooltipPrimitive.Provider>
    <TooltipPrimitive.Root bind:open {...restProps}>
      <TooltipPrimitive.Trigger {...triggerProps}>
        {#snippet child({ props })}
          <div {...props} class={triggerClasses}>{@render trigger()}</div>
        {/snippet}
      </TooltipPrimitive.Trigger>

      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          {...contentProps}
          class={contentClasses}
          sideOffset={contentProps.sideOffset ?? 8}
        >
          {@render children()}
          <!-- <TooltipPrimitive.Arrow class={arrowClasses} /> -->
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
{/if}
