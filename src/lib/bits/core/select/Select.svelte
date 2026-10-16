<script lang="ts">
// BITS-UI
import { Select as SelectPrimitive } from 'bits-ui'
// ICONS
import CheckIcon from 'virtual:icons/proicons/checkmark'
import ChevronsUpDownIcon from 'virtual:icons/proicons/arrow-up-down'
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

const itemsWithEmptyOption = $derived.by(() => {
  if (!allowDeselect) return items
  return [{ value: '', label: placeholder }, ...items]
})

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
      class={`bits-form__select-display bits-form__select-display--${variant} text-foreground`}
    >
      <span class="bits-form__select-label text-foreground">{selectedLabel}</span>
    </div>
  </div>
{:else}
  <SelectPrimitive.Root
    type="single"
    items={itemsWithEmptyOption}
    {name}
    {disabled}
    {allowDeselect}
    {value}
    onValueChange={handleValueChange}
  >
    <SelectPrimitive.Trigger
      {...triggerAttrs}
      class={`bits-form__select-trigger bits-form__select-trigger--${variant} text-foreground ${triggerClass} ${className}`}
      aria-label={placeholder}
    >
      <span class="bits-form__select-label text-foreground">{selectedLabel}</span>
      <ChevronsUpDownIcon class="bits-form__select-trigger-icon text-foreground" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={`bits-form__select-content text-foreground ${contentClass}`}
        sideOffset={8}
      >
        <SelectPrimitive.Viewport class="bits-form__select-viewport">
          {#each itemsWithEmptyOption as item (item.value)}
            <SelectPrimitive.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class="bits-form__select-item text-foreground"
            >
              {#snippet children({
                selected,
              })}
                <span class="bits-form__select-label text-foreground"
                  >{item.label}</span
                >
                {#if selected}
                  <CheckIcon class="ml-auto h-4 w-4 shrink-0 text-foreground" />
                {/if}
              {/snippet}
            </SelectPrimitive.Item>
          {/each}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
{/if}
