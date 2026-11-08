<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import { placeCategoryLabel } from '#lib/locations/placeSearchFilters.js'
let {
  label,
  options,
  value = $bindable<string | undefined>(),
}: {
  label: string
  options: string[]
  value?: string
} = $props()
let expanded = $state(false)
let query = $state('')
let limit = $state(40)
let input: HTMLInputElement | undefined = $state()
let trigger: HTMLButtonElement | undefined = $state()
const matches = $derived(
  options.filter(option =>
    placeCategoryLabel(option)
      .toLowerCase()
      .includes(query.trim().toLowerCase().replaceAll('_', ' ')),
  ),
)
/** Accept one exact category and return focus to its control.
 * @param next Publisher category identifier or undefined for no filter.
 * @returns Nothing.
 */
function select(next?: string): void {
  value = next
  expanded = false
  void tick().then(() => trigger?.focus())
}
</script>
<div class="min-w-0">
  <button
    bind:this={trigger}
    type="button"
    aria-expanded={expanded}
    aria-label={label}
    onclick={() => {
      expanded = !expanded
      query = ''
      limit = 40
      if (expanded) void tick().then(() => input?.focus())
    }}
    class="border-border hover:bg-muted focus-visible:outline-primary flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
  >
    <span class="text-muted-foreground text-sm">{label}</span>
    <span class="truncate text-sm font-medium"
      >{value ? placeCategoryLabel(value) : m.feature_search_any()}</span
    >
  </button>
  {#if expanded}
    <div class="border-border bg-panel mt-2 rounded-lg border p-2">
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (limit = 40)}
        aria-label={`${label}: ${m.feature_search_find_category()}`}
        placeholder={m.feature_search_find_category()}
        class="border-border bg-background focus:outline-primary mb-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-2"
      >
      <fieldset
        class="max-h-36 min-w-0 overflow-y-auto overscroll-contain"
        aria-label={label}
      >
        <button
          type="button"
          aria-pressed={!value}
          onclick={() => select()}
          class="hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:text-primary focus-visible:outline-primary block w-full rounded px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {m.feature_search_any()}
        </button>
        {#each matches.slice(0, limit) as option (option)}
          <button
            type="button"
            data-tooltip={option}
            aria-pressed={value === option}
            onclick={() => select(option)}
            class="hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:text-primary focus-visible:outline-primary block w-full rounded px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {placeCategoryLabel(option)}
          </button>
        {/each}
        {#if !matches.length}
          <p class="text-muted-foreground p-3 text-sm">
            {m.feature_search_no_categories()}
          </p>
        {/if}
        {#if matches.length > limit}
          <button
            type="button"
            onclick={() => (limit += 40)}
            class="text-primary w-full p-2 text-sm underline"
          >
            {m.feature_search_more_categories()}
          </button>
        {/if}
      </fieldset>
    </div>
  {/if}
</div>
