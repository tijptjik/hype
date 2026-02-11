<script lang="ts">
import { Switch as SwitchPrimitive } from './src'
// TYPES
import type { SwitchProps } from './switch.types'

let {
  checked = $bindable(false),
  disabled = false,
  required = false,
  name,
  value = 'on',
  id,
  states = 2,
  color = 'primary',
  rightColor,
  leftColor = 'neutral',
  midColor = 'neutral',
  size = 'md',
  class: className = '',
  thumbClass = '',
  onCheckedChange
}: SwitchProps = $props()

const resolvedRightColor = $derived(rightColor ?? color)
const resolvedRightColorValue = $derived(
  resolvedRightColor === 'neutral'
    ? 'var(--color-glass-base)'
    : `var(--color-${resolvedRightColor})`
)
const resolvedOnTrackMix = $derived(
  resolvedRightColor === 'neutral' ? '32%' : '28%'
)

const rootClass = $derived(
  [
    'bits-switch',
    `bits-switch--states-${states}`,
    `bits-switch--size-${size}`,
    'focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 peer',
    className
  ]
    .filter(Boolean)
    .join(' ')
)

const colorStyle = $derived(
  `--switch-right-color: ${resolvedRightColorValue}; --switch-left-color: var(--color-${leftColor}); --switch-mid-color: var(--color-${midColor}); --switch-track-on-mix: ${resolvedOnTrackMix};`
)

const defaultThumbClass = 'bits-switch__thumb'

const resolvedThumbClass = $derived(
  [defaultThumbClass, thumbClass].filter(Boolean).join(' ')
)

function handleCheckedChange(nextChecked: boolean | null) {
  checked = nextChecked
  onCheckedChange?.(nextChecked)
}
</script>

<SwitchPrimitive.Root
  bind:checked
  {states}
  {disabled}
  {required}
  {name}
  {value}
  {id}
  class={rootClass}
  style={colorStyle}
  onCheckedChange={handleCheckedChange}>
  <SwitchPrimitive.Thumb class={resolvedThumbClass} />
</SwitchPrimitive.Root>
