<script lang="ts">
// PROPERTY VALUES
import {
  encodePropertySelection,
  displayPropertyValueIds,
} from '#lib/properties/selection.js'
let {
  id,
  value = '',
  options = [],
  isEditing = true,
  onChange,
}: {
  id: string
  value?: string | null
  options?: Array<{ value: string; label: string }>
  isEditing?: boolean
  onChange: (value: string) => void
} = $props()
const selected = $derived(displayPropertyValueIds({ valueJson: value || null }))
</script>

{#if isEditing}
  <fieldset {id} class="grid min-w-0 gap-2">
    <legend class="sr-only">Select values</legend>
    {#each options as option (option.value)}
      <label
        class="hover:bg-primary/10 flex min-w-0 cursor-pointer items-start gap-3 rounded-md px-4 py-2"
      >
        <input
          type="checkbox"
          class="accent-primary mt-1 shrink-0"
          value={option.value}
          checked={selected.includes(option.value)}
          onchange={event =>
            onChange(
              encodePropertySelection(
                event.currentTarget.checked
                  ? [...selected, option.value]
                  : selected.filter(id => id !== option.value),
              ) ?? '',
            )}
        >
        <span class="min-w-0 break-words whitespace-normal">{option.label}</span>
      </label>
    {/each}
  </fieldset>
{:else}
  <p {id} class="min-w-0 break-words whitespace-normal">
    {options
      .filter(option => selected.includes(option.value))
      .map(option => option.label)
      .join('; ') || '—'}
  </p>
{/if}
