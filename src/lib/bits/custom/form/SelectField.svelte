<script lang="ts">
import { Select } from '$lib/bits/core'
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
  selectClass = '',
  displayClass = '',
  triggerClass = '',
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

<label class={wrapperClass} for={id}>
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
    {contentClass}
    {onValueChange}
  />
</label>
