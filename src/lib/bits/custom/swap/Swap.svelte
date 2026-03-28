<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
import {
  getSwapRootClasses,
  getSwapRootVars,
  SWAP_ICON_LAYER_CLASSES,
  SWAP_ICON_STACK_CLASSES,
} from './swap.styles'
// TYPES
import type { SwapProps } from './swap.types'

let {
  checked = $bindable(false),
  disabled = false,
  onIcon: OnIcon,
  offIcon: OffIcon,
  size = 'md',
  variant = 'default',
  onColor = 'primary',
  offColor = 'neutral',
  label = '',
  attrs = {},
  class: className = '',
  type = 'button',
  onCheckedChange,
}: SwapProps = $props()

let isHoverSuppressed = $state(false)
const rootClass = $derived(getSwapRootClasses({ variant, className }))
const rootStyle = $derived(getSwapRootVars({ checked, size, onColor, offColor }))
const offIconClass = $derived(checked ? 'opacity-0' : 'opacity-100')
const onIconClass = $derived(checked ? 'opacity-100' : 'opacity-0')

function handleClick(event: MouseEvent): void {
  if (disabled) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  const nextChecked = !checked
  checked = nextChecked
  isHoverSuppressed = true
  onCheckedChange?.(nextChecked)
}

function handleMouseLeave(): void {
  if (!isHoverSuppressed) return
  isHoverSuppressed = false
}
</script>

<button
  {...attrs}
  {type}
  data-ui="swap"
  class={rootClass}
  style={rootStyle}
  aria-pressed={checked}
  aria-label={label || undefined}
  data-state={checked ? 'checked' : 'unchecked'}
  data-hover-suppressed={isHoverSuppressed ? 'true' : 'false'}
  {disabled}
  onclick={handleClick}
  onmouseleave={handleMouseLeave}
>
  <span data-slot="icon-stack" class={SWAP_ICON_STACK_CLASSES} aria-hidden="true">
    <span data-slot="icon-off" class={cx(SWAP_ICON_LAYER_CLASSES, offIconClass)}>
      {#if OffIcon}
        <OffIcon />
      {/if}
    </span>
    <span data-slot="icon-on" class={cx(SWAP_ICON_LAYER_CLASSES, onIconClass)}>
      {#if OnIcon}
        <OnIcon />
      {/if}
    </span>
  </span>
</button>
