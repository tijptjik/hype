<script lang="ts">
import { Select } from '#lib/bits/core/index.js'
import Label from './src/label/Label.svelte'
import type { SelectFieldProps } from './selectField.types'

let {
  id,
  name,
  label,
  value = $bindable(''),
  items,
  placeholder = 'Select',
  required = false,
  isEditing = true,
  disabled = false,
  allowDeselect = false,
  variant = 'default',
  issues,
  class: className = '',
  wrapperAttrs = {},
  selectClass = '',
  displayClass = '',
  triggerClass = '',
  triggerAttrs = {},
  contentClass = '',
  onValueChange,
}: SelectFieldProps = $props()

const wrapperClass = $derived(
  [
    'bits-form__field',
    isEditing && issues ? 'bits-form__field--error' : '',
    disabled ? 'bits-form__field--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<div {...wrapperAttrs} class={wrapperClass}>
  <Label
    for={id}
    text={label}
    {required}
    {isEditing}
    issues={isEditing ? issues : undefined}
  />

  <Select
    bind:value
    {items}
    {name}
    {placeholder}
    {variant}
    {isEditing}
    {allowDeselect}
    {disabled}
    class={selectClass}
    {displayClass}
    {triggerClass}
    {triggerAttrs}
    {contentClass}
    {onValueChange}
  />
</div>
