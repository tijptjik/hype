<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import {
  getFeaturePlace,
  getFeaturePlaceCandidate,
  linkFeaturePlace,
  searchFeaturePlaces,
} from '#lib/api/place.remote.js'
// TYPES
import type { PlaceSearchCandidate } from '#lib/places/sourceClient.js'
import type { PlaceCandidateResolution } from '#lib/db/services/placeCandidate.js'

let {
  featureId,
  modifiedAt,
  isEditing,
  isDirty,
}: {
  featureId: string
  modifiedAt: string
  isEditing: boolean
  isDirty: boolean
} = $props()
const accepted = $derived(getFeaturePlace({ featureId }))
let query = $state('')
let results = $state<PlaceSearchCandidate[] | null>(null)
let selected = $state<PlaceCandidateResolution | null>(null)
let busy = $state(false)
let failed = $state(false)
let requestVersion = 0

/** Search all upstream Places; retain settled results while another query loads. */
async function search(): Promise<void> {
  if (!query.trim() || busy || !isEditing) return
  const version = ++requestVersion
  busy = true
  failed = false
  selected = null
  try {
    const response = await searchFeaturePlaces({ featureId, q: query.trim() })
    if (version === requestVersion) results = response.candidates
  } catch {
    if (version === requestVersion) failed = true
  } finally {
    if (version === requestVersion) busy = false
  }
}

/** Load verified facts, keeping an unavailable source distinct from an empty search. */
async function preview(candidate: PlaceSearchCandidate): Promise<void> {
  if (busy || !isEditing) return
  busy = true
  failed = false
  selected = null
  try {
    selected = await getFeaturePlaceCandidate({
      featureId,
      ssId: candidate.placeId,
      resourceReleaseId: candidate.resourceReleaseId,
    })
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Link only a persisted clean Feature; the server preserves its existing effective values. */
async function link(): Promise<void> {
  if (busy || !isEditing || isDirty || selected?.status !== 'ready') return
  busy = true
  failed = false
  try {
    await linkFeaturePlace({
      featureId,
      placeId: selected.placeId,
      revisionId: selected.revisionId,
      expectedFeatureModifiedAt: modifiedAt,
    })
    await accepted.refresh()
    selected = null
    results = null
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<section class="mb-8 space-y-4" aria-label={m.feature_place_title()}>
  <SectionHeader
    title={m.feature_place_title()}
    description={m.feature_place_description()}
  />
  <div class="space-y-4 px-6 pb-4">
    {#await accepted}
      <p class="text-sm text-muted-foreground" role="status">
        {m.feature_place_loading()}
      </p>
    {:then association}
      {#if association}
        <div class="rounded-xl border border-border bg-panel p-4">
          <p class="font-medium">
            {Object.values(association.effective.names).join(' · ')}
          </p>
          <p class="text-sm text-muted-foreground">{m.feature_place_linked()}</p>
        </div>
      {:else if isEditing}
        <div class="flex items-end gap-3">
          <TextInput
            id="feature-place-search"
            name=""
            label={m.feature_place_search_label()}
            bind:value={query}
            class="min-w-0 flex-1"
            inputAttrs={{
              maxlength: 200,
              onkeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void search()
                }
              },
            }}
          />
          <Button
            type="button"
            text={m.feature_place_search()}
            onClick={search}
            disabled={busy || !query.trim()}
          />
        </div>
        {#if busy}
          <p role="status" class="text-sm text-muted-foreground">
            {m.feature_place_loading()}
          </p>
        {/if}
        {#if results?.length === 0}
          <p class="text-sm text-muted-foreground">{m.feature_place_no_results()}</p>
        {/if}
        {#if results?.length}
          <ul class="max-h-72 space-y-2 overflow-y-auto">
            {#each results as candidate}
              <li>
                <button
                  type="button"
                  class="w-full rounded-xl border border-border bg-panel p-4 text-left hover:bg-muted disabled:opacity-50"
                  disabled={busy}
                  onclick={() => preview(candidate)}
                >
                  <span class="block font-medium"
                    >{candidate.nameText ?? candidate.placeId}</span
                  >
                  {#if candidate.brandText}
                    <span class="block text-sm text-muted-foreground"
                      >{candidate.brandText}</span
                    >
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if selected?.status === 'source-import-needed'}
          <p role="status" class="text-sm text-muted-foreground">
            {m.feature_place_import_needed()}
          </p>
        {:else if selected?.status === 'ready'}
          <div class="space-y-3 rounded-xl border border-border bg-panel p-4">
            <p class="font-medium">{Object.values(selected.facts.names).join(' · ')}</p>
            <p class="text-sm">
              {Object.values(selected.facts.location.address.fallbackDisplay).join(
                ' · ',
              )}
            </p>
            <p class="text-sm text-muted-foreground">
              {selected.facts.location.geometry.coordinates.join(', ')}
            </p>
            <p class="text-sm text-muted-foreground">{m.feature_place_preserve()}</p>
            {#if isDirty}
              <p class="text-sm text-muted-foreground">
                {m.feature_place_save_first()}
              </p>
            {/if}
            <Button
              type="button"
              text={m.feature_place_link()}
              onClick={link}
              disabled={busy || isDirty}
            />
          </div>
        {/if}
      {:else}
        <p class="text-sm text-muted-foreground">{m.feature_place_unlinked()}</p>
      {/if}
    {:catch}
      <p role="alert" class="text-sm text-destructive">{m.feature_place_failed()}</p>
    {/await}
    {#if failed}
      <p role="alert" class="text-sm text-destructive">{m.feature_place_failed()}</p>
    {/if}
  </div>
</section>
