<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// API
import { getLocationLinkedFeatures } from '#lib/api/locationDirectory.remote.js'
// ICONS
import FeatureIcon from 'virtual:icons/proicons/location'
import ArrowIcon from 'virtual:icons/lucide/arrow-up-right'
// TYPES
import type { LocationLinkedFeaturePage } from '#lib/db/services/locationFeatures.js'

let {
  locationId,
  organisationId,
  queryScope,
}: { locationId: string; organisationId?: string; queryScope: string } = $props()
let view = $state<'associated' | 'placed' | 'past'>('associated')
let page = $state<LocationLinkedFeaturePage | null>(null)
let loading = $state(false)
let failed = $state(false)
let generation = 0
let retry = $state(0)
onDestroy(() => {
  generation++
})
$effect(() => {
  const input = {
    locationId,
    view,
    organisationId,
    scope: queryScope,
    locale: getLocaleKey(),
  }
  const attempt = retry
  const version = ++generation
  page = null
  loading = true
  failed = false
  const request = getLocationLinkedFeatures(input)
  Promise.resolve(attempt ? request.refresh().then(() => request) : request)
    .then(result => {
      if (version === generation) page = result
    })
    .catch(() => {
      if (version === generation) failed = true
    })
    .finally(() => {
      if (version === generation) loading = false
    })
})

/** Extend the authorized list without replacing earlier rows or accepting a stale page.
 * @returns Resolves once the next accessible page has settled.
 */
async function more(): Promise<void> {
  if (loading || !page?.nextCursor) return
  const version = generation
  const previous = page
  loading = true
  failed = false
  try {
    const next = await getLocationLinkedFeatures({
      locationId,
      view,
      organisationId,
      scope: queryScope,
      locale: getLocaleKey(),
      after: previous.nextCursor ?? undefined,
    })
    if (version === generation)
      page = { data: [...previous.data, ...next.data], nextCursor: next.nextCursor }
  } catch {
    if (version === generation) failed = true
  } finally {
    if (version === generation) loading = false
  }
}
</script>

<section
  class="border-border space-y-3 border-t pt-6"
  aria-label={m.location_linked_features()}
  data-location-linked-features
>
  <div>
    <h2 class="text-lg font-semibold">{m.location_linked_features()}</h2>
    <p class="text-muted-foreground mt-1 text-sm">
      {m.location_linked_features_help()}
    </p>
  </div>
  <label class="block text-sm"
    >Show
    <select
      class="border-border bg-background ml-2 rounded border p-2"
      bind:value={view}
    >
      <option value="associated">Associated Features</option>
      <option value="placed">Features placed here</option>
      <option value="past">Past accepted placements</option>
    </select>
  </label>
  {#if page?.data.length}
    <ul class="divide-border divide-y">
      {#each page.data as feature (feature.id)}
        <li>
          <a
            href={`/admin/features/${encodeURIComponent(feature.id)}`}
            class="text-foreground hover:text-primary focus-visible:outline-primary flex min-h-16 items-center gap-3 py-3 transition focus-visible:outline-2"
          >
            <FeatureIcon class="text-primary size-5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1"
              ><span class="block truncate text-sm font-semibold">{feature.title}</span
              ><span class="text-muted-foreground mt-1 block truncate text-xs"
                >{feature.projectName}
                · {feature.layerName}</span
              ></span
            >
            {#if feature.isArchived}
              <span class="text-muted-foreground text-xs"
                >{m.location_linked_feature_archived()}</span
              >
            {:else if feature.isDraft || !feature.isPublished}
              <span class="text-muted-foreground text-xs"
                >{m.location_linked_feature_unpublished()}</span
              >
            {/if}
            <ArrowIcon
              class="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          </a>
        </li>
      {/each}
    </ul>
  {:else if !loading && !failed}
    <p class="text-muted-foreground text-sm">{m.location_linked_features_empty()}</p>
  {/if}
  {#if loading}
    <p role="status" class="text-muted-foreground text-sm">
      {m.location_directory_loading()}
    </p>
  {/if}
  {#if failed}
    <p role="alert" class="text-destructive text-sm">
      {m.resource_action_failed()}
      <button
        type="button"
        class="underline"
        onclick={() => {
          if (page) void more()
          else retry++
        }}
      >
        {m.address_divisions_retry()}
      </button>
    </p>
  {/if}
  {#if page?.nextCursor}
    <button
      type="button"
      disabled={loading}
      onclick={more}
      class="text-primary min-h-10 text-sm hover:underline disabled:opacity-50"
    >
      {m.location_linked_features_more()}
    </button>
  {/if}
</section>
