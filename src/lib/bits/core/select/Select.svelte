<script lang="ts">
// BITS-UI
import { Select as SelectPrimitive } from 'bits-ui'
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
import ChevronsUpDownIcon from 'virtual:icons/lucide/chevrons-up-down'
// TYPES
import type { SelectProps } from './select.types'

let {
  value = $bindable(''),
  items,
  placeholder = 'Select',
  variant = 'default',
  isEditing = true,
  allowDeselect = false,
  disabled = false,
  name,
  class: className = '',
  displayClass = '',
  triggerClass = '',
  triggerAttrs = {},
  contentClass = '',
  onValueChange,
}: SelectProps = $props()

const selectedLabel = $derived(
  value
    ? (items.find(item => item.value === value)?.label ?? placeholder)
    : placeholder,
)

function handleValueChange(nextValue: string): void {
  value = nextValue
  onValueChange?.(nextValue)
}
</script>

{#if !isEditing}
  <div
    class={`bits-form__control-wrap bits-form__select-display-wrap ${displayClass} ${className}`}
  >
    <div
      class={`bits-form__select-display bits-form__select-display--${variant} text-white`}
    >
      <span class="bits-form__select-label text-white">{selectedLabel}</span>
    </div>
  </div>
{:else}
  <SelectPrimitive.Root
    type="single"
    {items}
    {name}
    {disabled}
    {allowDeselect}
    {value}
    onValueChange={handleValueChange}
  >
    <SelectPrimitive.Trigger
      {...triggerAttrs}
      class={`bits-form__select-trigger bits-form__select-trigger--${variant} text-white ${triggerClass} ${className}`}
      aria-label={placeholder}
    >
      <span class="bits-form__select-label text-white">{selectedLabel}</span>
      <ChevronsUpDownIcon class="bits-form__select-trigger-icon text-white" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={`bits-form__select-content text-white ${contentClass}`}
        sideOffset={8}
      >
        <SelectPrimitive.Viewport class="bits-form__select-viewport">
          {#each items as item (item.value)}
            <SelectPrimitive.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class="bits-form__select-item text-white"
            >
              {#snippet children({ selected })}
                <span class="bits-form__select-label text-white">{item.label}</span>
                {#if selected}
                  <CheckIcon class="bits-form__select-item-check-icon text-white" />
                {/if}
              {/snippet}
            </SelectPrimitive.Item>
          {/each}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
{/if}
