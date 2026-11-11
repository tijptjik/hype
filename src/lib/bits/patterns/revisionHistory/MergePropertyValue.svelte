<script lang="ts">
// DOMAIN
import { phoneDisplay } from '#lib/utils/phone-property.js'
import { mergePropertyEntries, mergePropertyEntryText } from './mergePropertyDisplay.js'

let {
  value,
  phone = false,
  label,
  disabled = false,
  onChange,
}: {
  value: string
  phone?: boolean
  label: string
  disabled?: boolean
  onChange?: (value: string) => void
} = $props()
const entries = $derived(mergePropertyEntries(value, phone))
</script>

{#if entries?.length}
  <ul
    aria-label={label}
    class="min-w-0 list-outside list-disc space-y-1 pl-4 break-words whitespace-normal"
  >
    {#each entries as entry, index}
      {@const text = mergePropertyEntryText(entry)}
      <li>
        {#if onChange && typeof entry === 'string'}
          <input
            class="hover:border-border focus:border-primary focus-visible:outline-primary w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm focus-visible:outline-2 disabled:opacity-60"
            aria-label={`${label} ${index + 1}`}
            value={phone ? phoneDisplay(text).text : text}
            {disabled}
            onchange={event =>
              onChange?.(
                JSON.stringify(
                  entries?.map((item, itemIndex) =>
                    itemIndex === index ? event.currentTarget.value : item,
                  ),
                ),
              )}
          >
        {:else}
          {phone ? phoneDisplay(text).text : text}
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="min-w-0 break-words whitespace-pre-wrap">{entries ? '—' : value || '—'}</p>
{/if}
