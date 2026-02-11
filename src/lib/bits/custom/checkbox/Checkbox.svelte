<script lang="ts">
import { Checkbox as CheckboxPrimitive, Label, useId } from 'bits-ui'
// TYPES
import type { CheckboxProps } from './checkbox.types'

const generatedId = useId()

let {
  checked = $bindable(false),
  indeterminate = $bindable(false),
  disabled = false,
  required = false,
  readonly = false,
  name,
  value = 'on',
  id = generatedId,
  color = 'primary',
  size = 'md',
  leftText,
  rightText,
  topText,
  bottomText,
  showLabelsOnHoverOnly = false,
  class: className = '',
  onCheckedChange,
  onIndeterminateChange
}: CheckboxProps = $props()

const rootClass = $derived(
  [
    'bits-checkbox',
    `bits-checkbox--color-${color}`,
    `bits-checkbox--size-${size}`,
    'focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 peer',
    className
  ]
    .filter(Boolean)
    .join(' ')
)

const fieldClass = $derived(
  [
    'bits-checkbox-field',
    `bits-checkbox-field--size-${size}`,
    disabled ? 'bits-checkbox-field--disabled' : ''
  ]
    .filter(Boolean)
    .join(' ')
)

const sideLabelClass = $derived(
  [
    'bits-checkbox-label bits-checkbox-label--side',
    showLabelsOnHoverOnly ? 'bits-checkbox-label--hover-only' : ''
  ]
    .filter(Boolean)
    .join(' ')
)

const topBottomLabelClass = 'bits-checkbox-label bits-checkbox-label--stack'

function handleCheckedChange(nextChecked: boolean) {
  checked = nextChecked
  onCheckedChange?.(nextChecked)
}

function handleIndeterminateChange(nextIndeterminate: boolean) {
  indeterminate = nextIndeterminate
  onIndeterminateChange?.(nextIndeterminate)
}
</script>

<div class={fieldClass}>
  {#if topText}
    <Label.Root for={id} class={topBottomLabelClass}>{topText}</Label.Root>
  {/if}

  <div class="bits-checkbox-row">
    {#if leftText}
      <Label.Root for={id} class={sideLabelClass}>{leftText}</Label.Root>
    {/if}

    <CheckboxPrimitive.Root
      bind:checked
      bind:indeterminate
      {disabled}
      {required}
      {readonly}
      {name}
      {value}
      {id}
      class={rootClass}
      onCheckedChange={handleCheckedChange}
      onIndeterminateChange={handleIndeterminateChange}>
      {#snippet children({ checked: isChecked, indeterminate: isIndeterminate })}
        <span class="bits-checkbox__icon" aria-hidden="true">
          {#if isIndeterminate}
            <svg viewBox="0 0 16 16" class="bits-checkbox__icon-svg" fill="none">
              <path
                d="M3.5 8H12.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round" />
            </svg>
          {:else if isChecked}
            <svg viewBox="0 0 16 16" class="bits-checkbox__icon-svg" fill="none">
              <path
                d="M3.5 8.2L6.6 11.3L12.5 5.4"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          {/if}
        </span>
      {/snippet}
    </CheckboxPrimitive.Root>

    {#if rightText}
      <Label.Root for={id} class={sideLabelClass}>{rightText}</Label.Root>
    {/if}
  </div>

  {#if bottomText}
    <Label.Root for={id} class={topBottomLabelClass}>{bottomText}</Label.Root>
  {/if}
</div>
