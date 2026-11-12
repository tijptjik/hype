<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ADDRESS
import { ADDRESS_LOCALES } from '#lib/addresses/featureAddress.js'
import { buildingPartAddress } from '#lib/locations/buildingPartAddress.js'
// API
import { createLocalLocation } from '#lib/api/location.remote.js'
// DOMAIN
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

let {
  projectId,
  buildingId,
  address,
  parentPartId = $bindable(''),
  ready = $bindable(true),
}: {
  projectId: string
  buildingId: string
  address: FeatureAddress
  parentPartId?: string
  ready?: boolean
} = $props()
let parts = $state<{ key: number; name: string; id: string }[]>([])
let nextKey = 0
let active = true
onDestroy(() => {
  active = false
})
let busy = $state(false)
let failed = $state(false)
$effect(() => {
  ready = !busy && parts.every(part => Boolean(part.id))
})
/** Create one explicitly confirmed enclosing part under the preceding saved parent.
 * @param index Ordered hierarchy position. @returns Nothing; saved parents are retained if a later creation fails.
 */
async function create(index: number): Promise<void> {
  const part = parts[index]
  if (
    busy ||
    !buildingId ||
    !part?.name.trim() ||
    part.id ||
    (index > 0 && !parts[index - 1].id)
  )
    return
  busy = true
  failed = false
  try {
    const tag = ADDRESS_LOCALES[getLocaleKey()]
    const names = { [tag]: part.name.trim() }
    const draft: FeatureAddress = {
      ...$state.snapshot(address),
      association: {
        ...address.association,
        kind: 'building_part',
        originKind: 'building_part',
        mode: 'unlinked',
        lookup: 'not-checked',
        names,
        buildingId,
        parentPartId: index ? parts[index - 1].id : undefined,
      },
    }
    const result = await createLocalLocation({
      projectId,
      ...localIdentityFromAddress(
        'building_part',
        names,
        buildingPartAddress(draft, names),
        'exclusive',
      ),
      parseSource: names,
    })
    if (!active) return
    part.id = result.locationId
    parentPartId = result.locationId
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<div class="flex min-w-0 flex-col items-center gap-8" data-enclosing-parts>
  {#each parts as part, index (part.key)}
    <section
      class="border-primary/25 bg-primary/5 flex w-full min-w-0 flex-col items-center gap-4 rounded-2xl border p-6 text-center"
    >
      <h3 class="text-sm font-semibold">{m.location_part_enclosing()}</h3>
      <input
        aria-label={m.location_part_enclosing()}
        class="border-primary/25 bg-background w-full max-w-xs rounded-full border px-4 py-2.5 text-sm"
        bind:value={part.name}
        disabled={busy || Boolean(part.id)}
      >
      <button
        type="button"
        class="bg-primary text-primary-content rounded-full px-5 py-2.5 text-sm disabled:opacity-40"
        disabled={busy ||
          Boolean(part.id) ||
          !part.name.trim() ||
          !buildingId ||
          (index > 0 && !parts[index - 1].id)}
        onclick={() => create(index)}
      >
        {part.id ? m.location_part_saved() : m.association_create_building_part()}
      </button>
      {#if !part.id && index === parts.length - 1}
        <button
          type="button"
          disabled={busy}
          class="text-muted-foreground text-xs underline"
          onclick={() => (parts = parts.slice(0, -1))}
        >
          {m.location_part_remove()}
        </button>
      {/if}
    </section>
  {/each}
  <div class="flex flex-col items-center gap-2 text-center">
    <span class="text-muted-foreground text-xs"
      >{m.location_part_enclosing_optional()}</span
    >
    <button
      type="button"
      disabled={!buildingId || busy || parts.some(part => !part.id)}
      class="border-primary/30 text-primary rounded-full border px-4 py-2 text-sm disabled:opacity-40"
      onclick={() => (parts = [...parts, { key: nextKey++, name: '', id: '' }])}
    >
      {m.location_part_add_enclosing()}
    </button>
  </div>
  {#if failed}
    <p role="alert" class="text-destructive text-sm">{m.feature_location_failed()}</p>
  {/if}
</div>
