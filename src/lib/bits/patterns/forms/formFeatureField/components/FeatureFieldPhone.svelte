<script lang="ts">
// ICONS
import TrashIcon from 'virtual:icons/proicons/delete'
// VALUE FORMATTING
import { phoneDisplay } from '#lib/utils/phone-property.js'
// COMPONENTS
import FeatureFieldInput from './FeatureFieldInput.svelte'
let {
  id,
  value = '',
  placeholder = '',
  isEditing = true,
  headerAction = false,
  onChange,
}: {
  headerAction?: boolean
  id: string
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  onChange: (value: string) => void
} = $props()
const numbers = $derived.by((): string[] => {
  if (!value?.trim()) return ['']
  if (value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string'))
        return parsed.length ? parsed : ['']
    } catch {
      /* Preserve invalid legacy input for correction. */
    }
    return [value]
  }
  return value.split(/\r?\n/)
})
function save(next: string[]): void {
  onChange(JSON.stringify(next.filter(number => number.trim())))
}
/** Add another editable number.
 * @returns Nothing; emits the updated collection.
 */
export function add(): void {
  if (canAdd()) onChange(JSON.stringify([...numbers, '']))
}
/** Whether the current collection can accept another number.
 * @returns True when all existing entries contain text.
 */
export function canAdd(): boolean {
  return !numbers.some(number => !number.trim())
}
</script>
<div class="min-w-0 flex-1 space-y-2">
  {#each numbers as number, index}
    {#if !isEditing}
      {@const display = phoneDisplay(number)}
      <div class="flex min-h-12 items-center gap-3 text-base text-foreground">
        {#if display.flag}
          <span role="img" aria-label={display.country} class="text-xl leading-none"
            >{display.flag}</span
          >
        {/if}
        {#if display.href}
          <a href={display.href} class="tabular-nums hover:text-primary"
            >{display.text}</a
          >
        {:else}
          <span>{display.text || '—'}</span>
        {/if}
      </div>
    {:else}
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <FeatureFieldInput
            id={`${id}-${index}`}
            isPhone={true}
            value={number}
            {placeholder}
            {isEditing}
            onChange={next => {
              const updated = [...numbers]
              updated[index] = next
              onChange(
                updated.every(item => !item.trim()) ? '' : JSON.stringify(updated),
              )
            }}
          />
        </div>
        {#if isEditing && numbers.length > 1}
          <button
            type="button"
            class="mt-1.5 flex size-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            data-tooltip="Remove number"
            aria-label={`Remove phone number ${index + 1}`}
            onclick={() => save(numbers.filter((_, i) => i !== index))}
          >
            <TrashIcon class="size-5" />
          </button>
        {/if}
      </div>
    {/if}
  {/each}
  {#if isEditing && !headerAction}
    <button
      type="button"
      class="text-xs underline disabled:opacity-40"
      disabled={numbers.some(number => !number.trim())}
      onclick={add}
    >
      Add number
    </button>
  {/if}
</div>
