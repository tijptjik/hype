<script lang="ts">
import { researchDefaultSummary } from '#lib/fieldResearch/propertyChoices.js'
let {
  id,
  label,
  options,
  value = [],
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  value?: string[]
  disabled?: boolean
  onChange: (value: string[]) => void
} = $props()
let open = $state(false)
let search = $state('')
let input: HTMLInputElement
const selected = $derived(options.filter(option => value.includes(option.value)))
const filtered = $derived(
  options.filter(option =>
    option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  ),
)
const summary = $derived(researchDefaultSummary(selected.map(option => option.label)))

/** Open the list and place focus in its search field. @returns Nothing. */
function showOptions(): void {
  open = true
  search = ''
  requestAnimationFrame(() => input?.focus())
}
</script>

{#if disabled}
  <span {id} class="py-3 text-sm">{summary}</span>
{:else}
  <div
    class="relative min-w-0"
    onfocusout={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        open = false
    }}
  >
    <div
      class="border-border/50 flex min-h-10 flex-wrap items-center gap-1 rounded-lg border px-2 py-1"
    >
      {#each selected as option (option.value)}
        <span
          class="bg-base-200 group inline-flex max-w-full items-center gap-1 rounded px-2 py-1 text-sm"
        >
          <span class="break-words">{option.label}</span>
          <button
            type="button"
            aria-label={`Remove ${option.label}`}
            class="text-muted-foreground focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            onclick={() => onChange(value.filter(id => id !== option.value))}
          >
            ×
          </button>
        </span>
      {/each}
      <button
        {id}
        type="button"
        class="min-w-0 grow px-1 py-1 text-left text-sm"
        aria-label={`${label} default values`}
        aria-expanded={open}
        onclick={showOptions}
      >
        {selected.length ? 'Add values' : 'No default'}
      </button>
    </div>
    {#if open}
      <div
        class="bg-base-100 border-border absolute z-30 mt-1 w-full rounded-lg border p-2 shadow-lg"
      >
        <input
          bind:this={input}
          bind:value={search}
          aria-label={`Search ${label} options`}
          placeholder="Search options"
          class="border-border w-full rounded border bg-transparent px-2 py-1 text-sm"
          onkeydown={event => {
            if (event.key === 'Escape') {
              open = false
              document.getElementById(id)?.focus()
            }
          }}
        >
        <div class="mt-1 max-h-48 overflow-y-auto">
          {#each filtered as option (option.value)}
            <button
              type="button"
              class="hover:bg-base-200 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm"
              aria-pressed={value.includes(option.value)}
              onclick={() => {
                onChange(
                  value.includes(option.value)
                    ? value.filter(id => id !== option.value)
                    : [...value, option.value],
                )
                input?.focus()
              }}
            >
              <span aria-hidden="true"
                >{value.includes(option.value) ? '✓' : '　'}</span
              >{option.label}
            </button>
          {:else}
            <p class="text-muted-foreground px-2 py-1 text-sm">No matching options</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
