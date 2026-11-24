<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import {
  getBuildingAddressReview,
  linkBuildingAddresses,
} from '#lib/api/locationRelationships.remote.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'

type Choice = { id: string; snapshotId: string; label: string }
let {
  locationId,
  organisationId,
  onSaved,
  onCancel,
}: {
  locationId: string
  organisationId: string | null
  onSaved: () => Promise<void>
  onCancel: () => void
} = $props()
let query = $state('')
let rows = $state<Choice[]>([])
let selected = $state<Choice[]>([])
let linked = $state<string[]>([])
let busy = $state(false)
let failure = $state('')
const control = 'rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50'
const choices = $derived([
  ...rows,
  ...selected.filter(item => !rows.some(row => row.id === item.id)),
])

/** Open with the release-pinned footprint's addresses and the effective saved links. */
async function open(): Promise<void> {
  busy = true
  try {
    const review = await refreshRemoteQuery(
      getBuildingAddressReview({ locationId, organisationId }),
    )
    linked = review.linked
    rows = review.choices.map(item => ({
      id: item.id,
      snapshotId: item.snapshotId,
      label: item.display.en || Object.values(item.display)[0] || item.id,
    }))
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}

/** Search for additional published addresses, keeping selections from earlier searches. */
async function search(): Promise<void> {
  if (busy || !query.trim()) return
  busy = true
  failure = ''
  try {
    const found = await geocodeAddressCandidates(
      { address: query.trim() },
      { limit: 50 },
    )
    const byId = new Map<string, Choice>()
    for (const item of found) {
      const source = item.addressMeta.address?.source
      if (source?.address2dId && source.snapshotId)
        byId.set(source.address2dId, {
          id: source.address2dId,
          snapshotId: source.snapshotId,
          label: item.i18n.en.displayAddress || source.address2dId,
        })
    }
    rows = [...byId.values()]
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}

/** Persist all explicitly checked addresses and refresh the relationship list. */
async function save(): Promise<void> {
  if (!selected.length || busy) return
  busy = true
  failure = ''
  try {
    await linkBuildingAddresses({
      locationId,
      organisationId,
      addresses: selected.map(({ id, snapshotId }) => ({ id, snapshotId })),
    })
    await onSaved()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
onMount(() => {
  void open()
})
</script>
<section aria-label="Link building addresses" class="space-y-3">
  <label class="grid gap-1 text-sm"
    >Search SaanSeoi addresses
    <input
      class={control}
      bind:value={query}
      maxlength={500}
      onkeydown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void search()
        }
      }}
    >
  </label>
  <button
    type="button"
    class={control}
    disabled={busy || !query.trim()}
    onclick={search}
  >
    Search addresses
  </button>
  {#if busy}
    <div
      role="status"
      aria-label="Updating address choices"
      class="bg-muted h-12 animate-pulse rounded-lg"
    ></div>
  {/if}
  {#if failure}
    <p role="alert" class="text-error text-sm">{failure}</p>
  {/if}
  {#if choices.length}
    <fieldset class="space-y-2">
      <legend class="mb-2 text-sm font-semibold">Addresses for this building</legend>
      {#each choices as row (row.id)}
        <label class="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            class="mt-1"
            checked={linked.includes(row.id) ||
              selected.some(item => item.id === row.id)}
            disabled={busy ||
              linked.includes(row.id) ||
              (selected.length >= 30 && !selected.some(item => item.id === row.id))}
            onchange={event => {
              selected = event.currentTarget.checked
                ? [...selected, row]
                : selected.filter(item => item.id !== row.id)
            }}
          >
          <span>{row.label}{linked.includes(row.id) ? ' (linked)' : ''}</span>
        </label>
      {/each}
    </fieldset>
  {:else if !busy && !failure}
    <p class="text-muted-foreground text-sm">
      No address choices found. Search by street address or building name.
    </p>
  {/if}
  <div class="flex gap-2">
    <button
      type="button"
      class={control}
      disabled={busy || !selected.length}
      onclick={save}
    >
      Link selected addresses ({selected.length})
    </button>
    <button type="button" class={control} disabled={busy} onclick={onCancel}>
      Cancel
    </button>
  </div>
</section>
