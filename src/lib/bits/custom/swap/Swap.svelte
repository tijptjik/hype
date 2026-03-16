<script lang="ts">
import type { ButtonColor } from '$lib/bits/core/button/button.types'
import type { SwapProps } from './swap.types'

let {
  checked = $bindable(false),
  disabled = false,
  onIcon,
  offIcon,
  size = 'md',
  onColor = 'primary',
  offColor = 'neutral',
  label = '',
  attrs = {},
  class: className = '',
  type = 'button',
  onCheckedChange,
}: SwapProps = $props()

let isHoverSuppressed = $state(false)

const resolvedOnIcon = $derived(onIcon ?? offIcon)
const resolvedOffIcon = $derived(offIcon ?? onIcon)

const rootClass = $derived(
  ['bits-swap', `bits-swap--size-${size}`, className].filter(Boolean).join(' '),
)

const colorStyle = $derived(
  `--swap-on-color:${resolveSwapColorToken(onColor)}; --swap-off-color:${resolveSwapColorToken(offColor)};`,
)

function resolveSwapColorToken(color: ButtonColor): string {
  if (color === 'neutral') return 'var(--color-glass-base)'
  if (color === 'light') return 'var(--color-base-100)'
  if (color === 'dark') return 'var(--color-base-content)'
  return `var(--color-${color})`
}

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
  class={rootClass}
  style={colorStyle}
  aria-pressed={checked}
  aria-label={label || undefined}
  data-state={checked ? 'checked' : 'unchecked'}
  data-hover-suppressed={isHoverSuppressed ? 'true' : 'false'}
  {disabled}
  onclick={handleClick}
  onmouseleave={handleMouseLeave}
>
  <span class="bits-swap__icon-stack" aria-hidden="true">
    <span class="bits-swap__icon-layer bits-swap__icon-layer--off">
      {@render resolvedOffIcon?.()}
    </span>
    <span class="bits-swap__icon-layer bits-swap__icon-layer--on">
      {@render resolvedOnIcon?.()}
    </span>
  </span>
</button>
