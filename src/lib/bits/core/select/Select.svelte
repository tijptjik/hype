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
  reserveTriggerSpace = false,
  allowDeselect = false,
  disabled = false,
  name,
  class: className = '',
  displayClass = '',
  triggerClass = '',
  triggerAttrs = {},
  contentClass = '',
  onValueChange,
  itemPreview,
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
    class={`bits-form__control-wrap bits-form__select-display-wrap ${variant === 'ghost' ? 'border-transparent bg-transparent shadow-none' : ''} ${reserveTriggerSpace && variant === 'ghost' && !itemPreview ? 'border-0! px-0!' : ''} ${itemPreview ? 'pr-3!' : ''} ${displayClass} ${className}`}
  >
    <div
      class={`bits-form__select-display bits-form__select-display--${variant} text-foreground ${reserveTriggerSpace ? 'gap-2' : ''} ${reserveTriggerSpace && variant === 'ghost' && !itemPreview ? 'pr-0! pl-4!' : ''} ${itemPreview ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1rem] gap-3 p-0!' : ''}`}
    >
      <span
        class={`bits-form__select-label text-foreground ${itemPreview ? 'pl-0! text-left' : reserveTriggerSpace ? 'pl-1.5' : ''}`}
        >{selectedLabel}</span
      >
      {#if itemPreview}
        <span class="flex min-w-0 items-center">{@render itemPreview(value)}</span>
      {/if}
      {#if reserveTriggerSpace || itemPreview}
        <ChevronsUpDownIcon
          class="bits-form__select-trigger-icon invisible"
          aria-hidden="true"
        />
      {/if}
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
      class={`bits-form__select-trigger bits-form__select-trigger--${variant} text-foreground ${itemPreview ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1rem] gap-3' : ''} ${triggerClass} ${className}`}
      aria-label={typeof triggerAttrs['aria-label'] === 'string'
        ? triggerAttrs['aria-label']
        : placeholder}
    >
      <span
        class={`bits-form__select-label text-foreground ${itemPreview ? 'pl-0! text-left' : ''}`}
        >{selectedLabel}</span
      >
      {#if itemPreview}
        <span class="flex min-w-0 items-center">{@render itemPreview(value)}</span>
      {/if}
      <ChevronsUpDownIcon class="bits-form__select-trigger-icon text-foreground" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={`bits-form__select-content text-foreground ${itemPreview ? 'p-0' : ''} ${contentClass}`}
        sideOffset={8}
      >
        <SelectPrimitive.Viewport
          class={`bits-form__select-viewport ${itemPreview ? 'p-0' : ''}`}
        >
          {#each itemsWithEmptyOption as item (item.value)}
            <SelectPrimitive.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class={`bits-form__select-item text-foreground ${itemPreview ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1rem] gap-3 py-2' : ''}`}
            >
              {#snippet children({ selected })}
                <span
                  class={`bits-form__select-label text-foreground ${itemPreview ? 'pl-0! text-left' : ''}`}
                  >{item.label}</span
                >
                {#if itemPreview}
                  <span class="flex min-w-0 items-center"
                    >{@render itemPreview(item.value)}</span
                  >
                  <span class="flex w-4 shrink-0 items-center">
                    {#if selected}
                      <CheckIcon class="h-4 w-4" />
                    {/if}
                  </span>
                {:else if selected}
                  <CheckIcon class="text-foreground ml-auto h-4 w-4 shrink-0" />
                {/if}
              {/snippet}
            </SelectPrimitive.Item>
          {/each}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
{/if}
