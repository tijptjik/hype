<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// DOMAIN
import { loadAddressNames, type AddressName } from '#lib/addresses/nameCatalogue.js'
let {
  family,
  value,
  label,
  onSelect,
}: {
  family: 'streets' | 'buildings'
  value: string
  label: string
  onSelect: (record: AddressName | null) => void
} = $props()
let rows = $state<AddressName[]>([])
let query = $state('')
let open = $state(false)
let failed = $state(false)
let loading = $state(true)
const matches = $derived(
  rows
    .filter(row =>
      Object.values(row.names).some(name =>
        name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    )
    .slice(0, 30),
)
/** Retrieve the controlled vocabulary, exposing retry on failure. @returns Completion. */
async function load(): Promise<void> {
  loading = true
  failed = false
  try {
    rows = await loadAddressNames(family)
  } catch {
    failed = true
  } finally {
    loading = false
  }
}
// Preload the catalogue when the containing page mounts its pickers.
onMount(() => {
  void load()
})
</script>
<div class="min-w-0 flex-1">
  <button
    type="button"
    aria-label={label}
    aria-expanded={open}
    class="w-full rounded-md border border-border bg-input px-3 py-2 text-left text-sm"
    onclick={() => {
      open = !open
      query = ''
    }}
  >
    {value || m.address_name_choose()}
  </button>
  {#if open}
    <div class="mt-2 space-y-2 rounded-md border border-border p-2">
      <input
        aria-label={`${label}: ${m.address_name_search()}`}
        bind:value={query}
        placeholder={m.address_name_search()}
        class="w-full rounded border border-border bg-panel px-3 py-2"
      >
      {#if loading}
        <p class="text-sm">{m.resource_loading()}</p>
      {:else if failed}
        <button type="button" class="text-sm underline" onclick={() => void load()}>
          {m.feature_start_retry()}
        </button>
      {:else}
        <div class="max-h-48 overflow-y-auto">
          {#each matches as row (row.id)}
            <button
              type="button"
              class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              onclick={() => {
                onSelect(row)
                open = false
              }}
            >
              {Object.entries(row.names).find(
                ([key]) => key.toLowerCase() === getLocale().toLowerCase(),
              )?.[1] ||
                row.names.en ||
                Object.values(row.names)[0]}
              <span class="ml-2 text-xs text-muted-foreground"
                >{row.divisionCodes.join(' · ')}</span
              >
            </button>
          {/each}
          {#if !matches.length}
            <p class="p-2 text-sm">{m.feature_start_empty()}</p>
          {/if}
        </div>
      {/if}
      <button
        type="button"
        class="text-sm underline"
        onclick={() => {
          onSelect(null)
          open = false
        }}
      >
        {m.address_name_clear()}
      </button>
    </div>
  {/if}
</div>
