<script lang="ts">
// API
import { findPhysicalBuildingParents } from '#lib/api/buildingEvidence.remote.js'
// DOMAIN
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { getLocaleKey } from '#lib/i18n.js'

let {
  locationId,
  organisationId,
  busy,
  onPlace,
  actionLabel = 'Place here',
}: {
  locationId?: string
  organisationId: string
  actionLabel?: string
  busy: boolean
  onPlace: (parentId: string) => Promise<void>
} = $props()
let query = $state('')
let after = $state<string>()
let previous = $state<(string | undefined)[]>([])
const parents = $derived(
  findPhysicalBuildingParents({ locationId, organisationId, q: query.trim(), after }),
)
const control = 'border-border rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
</script>

<section class="space-y-3" aria-label="Existing physical buildings">
  <label class="grid gap-1 text-sm"
    >Find a physical building by name or address
    <input
      class={control}
      bind:value={query}
      maxlength={200}
      disabled={busy}
      oninput={() => {
        after = undefined
        previous = []
      }}
    >
  </label>
  {#await parents}
    <div
      class="bg-muted h-16 animate-pulse rounded-lg"
      role="status"
      aria-label="Finding physical buildings"
    ></div>
  {:then page}
    {#each page.rows as parent (parent.id)}
      {@const label =
        parent.names.en || Object.values(parent.names).find(Boolean) || parent.id}
      {@const address = parent.address
        ? getAddressDisplay(
            { ...emptyFeatureAddress(), source: parent.address },
            getLocaleKey(),
            [],
            'building',
          )
        : ''}
      <div
        class="border-border flex flex-wrap items-center justify-between gap-2 border-b py-2"
      >
        <div class="min-w-0 break-words">
          <a
            class="underline"
            href={'/admin/locations/' +
              encodeURIComponent(parent.id) +
              '?organisation=' +
              encodeURIComponent(organisationId)}
            target="_blank"
            rel="noreferrer"
            >{label}</a
          >
          {#if address}
            <p class="text-muted-foreground text-sm">{address}</p>
          {/if}
        </div>
        <button
          type="button"
          class={control}
          disabled={busy}
          onclick={() => onPlace(parent.id)}
        >
          {actionLabel}
        </button>
      </div>
    {:else}
      <p class="text-muted-foreground text-sm">No matching physical buildings.</p>
    {/each}
    {#if previous.length}
      <button
        type="button"
        class={control}
        disabled={busy}
        onclick={() => {
          after = previous.at(-1)
          previous = previous.slice(0, -1)
        }}
      >
        Previous buildings
      </button>
    {/if}
    {#if page.nextCursor}
      <button
        type="button"
        class={control}
        disabled={busy}
        onclick={() => {
          previous = [...previous, after]
          after = page.nextCursor ?? undefined
        }}
      >
        More physical buildings
      </button>
    {/if}
  {:catch}
    <p role="alert" class="text-error text-sm">Could not load physical buildings.</p>
    <button type="button" class={control} onclick={() => parents.refresh()}>
      Retry
    </button>
  {/await}
</section>
