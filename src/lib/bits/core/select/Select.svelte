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
    <div class={`bits-form__select-display bits-form__select-display--${variant}`}>
      <span class="bits-form__select-label">{selectedLabel}</span>
    </div>
  </div>
{:else}
  <SelectPrimitive.Root
    type="single"
    {items}
    {name}
    {disabled}
    {allowDeselect}
    value={value || undefined}
    onValueChange={handleValueChange}
  >
    <SelectPrimitive.Trigger
      class={`bits-form__select-trigger bits-form__select-trigger--${variant} ${triggerClass} ${className}`}
      aria-label={placeholder}
    >
      <span class="bits-form__select-label">{selectedLabel}</span>
      <ChevronsUpDownIcon class="bits-form__select-trigger-icon" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={`bits-form__select-content ${contentClass}`}
        sideOffset={8}
      >
        <SelectPrimitive.Viewport class="bits-form__select-viewport">
          {#each items as item (item.value)}
            <SelectPrimitive.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class="bits-form__select-item"
            >
              {#snippet children({ selected })}
                <span class="bits-form__select-label">{item.label}</span>
                {#if selected}
                  <CheckIcon class="bits-form__select-item-check-icon" />
                {/if}
              {/snippet}
            </SelectPrimitive.Item>
          {/each}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
{/if}
