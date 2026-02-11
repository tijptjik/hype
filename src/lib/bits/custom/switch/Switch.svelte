<script lang="ts">
import { Label, useId } from 'bits-ui'
import { Switch as SwitchPrimitive } from './src'
// TYPES
import type { SwitchProps } from './switch.types'

const generatedId = useId()

let {
  checked = $bindable(false),
  disabled = false,
  required = false,
  name,
  value = 'on',
  id = generatedId,
  states = 2,
  color = 'primary',
  rightColor,
  leftColor = 'neutral',
  midColor = 'neutral',
  size = 'md',
  leftText,
  rightText,
  topText,
  bottomText,
  showLabelsOnHoverOnly = false,
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

const fieldClass = $derived(
  [
    'bits-switch-field',
    `bits-switch-field--states-${states}`,
    `bits-switch-field--size-${size}`,
    disabled ? 'bits-switch-field--disabled' : ''
  ]
    .filter(Boolean)
    .join(' ')
)

const leftLabelClass = $derived(
  [
    'bits-switch-label bits-switch-label--side',
    states === 3 && checked === false ? 'bits-switch-label--active' : '',
    states === 3 && checked === null ? 'bits-switch-label--inactive' : '',
    showLabelsOnHoverOnly ? 'bits-switch-label--hover-only' : ''
  ]
    .filter(Boolean)
    .join(' ')
)

const rightLabelClass = $derived(
  [
    'bits-switch-label bits-switch-label--side',
    states === 3 && checked === true ? 'bits-switch-label--active' : '',
    states === 3 && checked === null ? 'bits-switch-label--inactive' : '',
    showLabelsOnHoverOnly ? 'bits-switch-label--hover-only' : ''
  ]
    .filter(Boolean)
    .join(' ')
)

const topBottomLabelClass = 'bits-switch-label bits-switch-label--stack'

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

function setTriState(next: boolean | null) {
  checked = next
  onCheckedChange?.(next)
}

function handleLeftLabelClick(event: MouseEvent) {
  if (states !== 3 || disabled) return
  event.preventDefault()
  event.stopPropagation()

  if (checked === false) {
    setTriState(null)
    return
  }

  setTriState(false)
}

function handleRightLabelClick(event: MouseEvent) {
  if (states !== 3 || disabled) return
  event.preventDefault()
  event.stopPropagation()

  if (checked === true) {
    setTriState(null)
    return
  }

  setTriState(true)
}

function handleTopLabelClick(event: MouseEvent) {
  if (states !== 3 || disabled) return
  event.preventDefault()
  event.stopPropagation()

  if (checked === false) {
    setTriState(null)
    return
  }
  if (checked === null) {
    setTriState(true)
    return
  }
  setTriState(false)
}
</script>

<div class={fieldClass}>
  {#if topText}
    <Label.Root for={id} class={topBottomLabelClass} onclick={handleTopLabelClick}
      >{topText}</Label.Root
    >
  {/if}

  <div class="bits-switch-row">
    {#if leftText}
      <Label.Root for={id} class={leftLabelClass} onclick={handleLeftLabelClick}
        >{leftText}</Label.Root
      >
    {/if}

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

    {#if rightText}
      <Label.Root for={id} class={rightLabelClass} onclick={handleRightLabelClick}
        >{rightText}</Label.Root
      >
    {/if}
  </div>

  {#if bottomText}
    <Label.Root for={id} class={topBottomLabelClass}>{bottomText}</Label.Root>
  {/if}
</div>
