<script lang="ts">
// API
import {
  findWikidataBrands,
  getWikidataBrand,
} from '#lib/api/identityCatalogue.remote.js'
// TYPES
import type { WikidataBrand } from '#lib/api/services/wikidataBrands.js'
let {
  value = $bindable<string | undefined>(),
  persisted,
  name,
  disabled = false,
  onUseLogo,
}: {
  value?: string
  persisted?: string
  name: string
  disabled?: boolean
  onUseLogo: (logo: NonNullable<WikidataBrand['logo']>) => Promise<void>
} = $props()
let search = $state('')
let results = $state<Omit<WikidataBrand, 'logo'>[]>([])
let preview = $state<WikidataBrand | null>(null)
let searching = $state(false)
let loading = $state(false)
let failure = $state('')
let searched = $state(false)
let generation = 0
let retry = $state(0)
$effect(() => {
  const id = value
  const attempt = retry
  failure = ''
  preview = null
  if (!id) return
  let cancelled = false
  loading = true
  const query = getWikidataBrand({ id })
  void (async () => {
    if (attempt) await query.refresh()
    return await query
  })()
    .then(result => {
      if (!cancelled) preview = result
    })
    .catch(() => {
      if (!cancelled) failure = 'Could not load the Wikidata preview. Try again.'
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})
/** Search explicit text and ignore responses superseded by a later search.
 * @returns Completion after updating candidate results.
 */
async function lookup(): Promise<void> {
  const query = (search || name).trim()
  if (query.length < 2) return
  const request = ++generation
  searching = true
  failure = ''
  try {
    const rows = await findWikidataBrands({ search: query })
    if (request === generation) {
      results = rows
      searched = true
    }
  } catch {
    if (request === generation) failure = 'Wikidata search is unavailable. Try again.'
  } finally {
    if (request === generation) searching = false
  }
}
</script>

<section aria-label="Wikidata" class="grid content-start gap-2">
  <h4 class="text-muted-foreground text-xs font-medium">Wikidata</h4>
  {#if value}
    <div class="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <a
        class="underline"
        href={`https://www.wikidata.org/wiki/${value}`}
        target="_blank"
        rel="noreferrer"
        >{preview?.label ?? value}
        · {value}</a
      >
      {#if !persisted && !disabled}
        <button
          type="button"
          class="text-muted-foreground underline"
          onclick={() => {
            value = undefined
            failure = ''
            loading = false
          }}
        >
          Clear selection
        </button>
      {/if}
    </div>
    {#if !disabled && preview?.description}
      <p class="text-muted-foreground text-sm">{preview.description}</p>
    {/if}
    {#if loading}
      <p role="status" class="text-muted-foreground text-sm">Loading preview…</p>
    {/if}
    {#if !disabled && preview?.logo}
      {@const logo = preview.logo}
      <div class="flex flex-wrap items-center gap-3">
        <img
          src={logo.url}
          alt="Wikimedia logo preview"
          class="size-16 object-contain"
          referrerpolicy="no-referrer"
        >
        <div class="grid gap-1 text-sm">
          {#if !disabled}
            <button
              type="button"
              class="text-left underline"
              onclick={() => onUseLogo(logo)}
            >
              Use this logo
            </button>
          {/if}
          <a
            class="text-muted-foreground underline"
            href={logo.sourceUrl}
            target="_blank"
            rel="noreferrer"
            >Wikimedia Commons · {logo.license || 'File details'}</a
          >
          {#if logo.attribution}
            <p class="text-muted-foreground max-w-md text-xs break-words">
              {logo.attribution}
            </p>
          {/if}
        </div>
      </div>
    {:else if !disabled && preview}
      <p class="text-muted-foreground text-sm">
        No logo is available from Wikimedia Commons.
      </p>
    {/if}
  {:else if !disabled}
    <div class="flex flex-wrap gap-2">
      <input
        aria-label="Search Wikidata"
        placeholder={name || 'Brand name'}
        value={search}
        oninput={event => {
          search = event.currentTarget.value
        }}
        maxlength="200"
        class="border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        onkeydown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void lookup()
          }
        }}
      >
      <button
        type="button"
        class="border-border rounded-md border px-3 py-2 text-sm"
        disabled={searching || (search || name).trim().length < 2}
        onclick={lookup}
      >
        {searching ? 'Searching…' : 'Search Wikidata'}
      </button>
    </div>
    {#each results as result (result.id)}
      <button
        type="button"
        class="border-border hover:bg-muted grid gap-1 rounded-md border p-3 text-left text-sm"
        onclick={() => {
          value = result.id
          failure = ''
        }}
      >
        <span>{result.label} · {result.id}</span>
        <span class="text-muted-foreground">{result.description}</span>
      </button>
    {:else}
      {#if searched}
        <p role="status" class="text-muted-foreground text-sm">
          No matching entities found.
        </p>
      {/if}
    {/each}
  {:else}
    <p class="text-muted-foreground px-4 py-2 text-sm">None</p>
  {/if}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
    {#if value}
      <button type="button" class="text-left text-sm underline" onclick={() => retry++}>
        Retry preview
      </button>
    {/if}
  {/if}
</section>
