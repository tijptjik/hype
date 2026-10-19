<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import {
  getFeaturePlace,
  getFeatureDetachedBrands,
  getFeaturePlaceCandidate,
  linkFeaturePlace,
  relinkFeaturePlace,
  searchFeaturePlaces,
  searchFeatureLocalPlaces,
} from '#lib/api/place.remote.js'
// COMPONENTS
import CreateLocalPlace from './CreateLocalPlace.svelte'
import PlaceBrandEditor from './PlaceBrandEditor.svelte'
import PlaceResetFields from './PlaceResetFields.svelte'
import PlaceReviewSection from './PlaceReviewSection.svelte'
import type { PlaceReset } from '#lib/places/reset.js'
import type { PlaceBrandEdit } from '#lib/places/brandEdit.js'
// TYPES
import type { PlaceSearchCandidate } from '#lib/places/sourceClient.js'
import type { LocalPlaceCandidate } from '#lib/db/services/placeCandidate.js'
import type { PlaceFacts } from '#lib/places/model.js'
type Selection =
  | { status: 'source-import-needed' }
  | { status: 'ready'; placeId: string; revisionId: string; facts: PlaceFacts }

let {
  featureId,
  projectId,
  coordinates,
  modifiedAt,
  isEditing,
  isDirty,
  brandEdit,
  onBrandEdit,
  reset,
  onResetFields,
  onUnlink,
  onSourceUpdate,
}: {
  featureId: string
  projectId: string
  coordinates: number[]
  modifiedAt: string
  isEditing: boolean
  isDirty: boolean
  brandEdit?: unknown
  onBrandEdit: (edit: PlaceBrandEdit) => void
  reset?: unknown
  onResetFields: (reset: PlaceReset | undefined) => void
  onUnlink: (expectedRevision: string) => Promise<void>
  onSourceUpdate: () => Promise<void>
} = $props()
const accepted = $derived(getFeaturePlace({ featureId }))
let query = $state('')
let results = $state<PlaceSearchCandidate[] | null>(null)
let localResults = $state<LocalPlaceCandidate[] | null>(null)
let selected = $state<Selection | null>(null)
let busy = $state(false)
let failed = $state(false)
let searchFailed = $state(false)
let requestVersion = 0
let replacementRevision = $state<string | null>(null)

/** Preserve values through the parent-owned unlink command and refresh the regular form. */
async function unlink(expectedRevision: string): Promise<void> {
  if (busy || !isEditing || isDirty) return
  busy = true
  failed = false
  try {
    await onUnlink(expectedRevision)
    await accepted.refresh()
    replacementRevision = null
    selected = null
    results = null
    localResults = null
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Search source and project-local Places independently, retaining settled results while loading. */
async function search(): Promise<void> {
  if (!query.trim() || busy || !isEditing) return
  const version = ++requestVersion
  searchFailed = false
  busy = true
  failed = false
  selected = null
  try {
    const localQuery = searchFeatureLocalPlaces({ featureId, q: query.trim() })
    const [source, local] = await Promise.allSettled([
      searchFeaturePlaces({ featureId, q: query.trim() }),
      localQuery.refresh().then(() => localQuery),
    ])
    if (version === requestVersion) {
      results = source.status === 'fulfilled' ? source.value.candidates : null
      localResults = local.status === 'fulfilled' ? local.value : null
      searchFailed = source.status === 'rejected' || local.status === 'rejected'
    }
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
    const input = {
      featureId,
      placeId: selected.placeId,
      revisionId: selected.revisionId,
      expectedFeatureModifiedAt: modifiedAt,
    }
    if (replacementRevision) {
      await relinkFeaturePlace({ ...input, expectedRevision: replacementRevision })
    } else {
      await linkFeaturePlace(input)
    }
    await accepted.refresh()
    replacementRevision = null
    selected = null
    results = null
    localResults = null
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
          {#if association.state !== 'linked'}
            <p class="text-sm text-muted-foreground">
              {association.state === 'manual'
                ? m.feature_place_manual_kind()
                : m.feature_place_unresolved_kind()}
            </p>
          {/if}
          {#if isEditing}
            <Button
              type="button"
              text={m.feature_place_change()}
              disabled={busy || isDirty}
              onClick={() => {
                replacementRevision = association.revision
                selected = null
              }}
            />
            <Button
              type="button"
              text={m.feature_place_unlink()}
              disabled={busy || isDirty}
              onClick={() => void unlink(association.revision)}
            />
          {/if}
        </div>
        {#if isEditing}
          <PlaceResetFields
            revision={association.revision}
            {reset}
            onChange={onResetFields}
          />
        {/if}
        <PlaceBrandEditor
          {association}
          edit={brandEdit}
          {isEditing}
          onChange={onBrandEdit}
        />
      {/if}
      {#if !association}
        {#await getFeatureDetachedBrands({ featureId }) then detached}
          {#if detached}
            <PlaceBrandEditor
              association={{
                revision: detached.revision,
                brandMode: 'override',
                effective: { brands: detached.brands },
              }}
              canInherit={false}
              edit={brandEdit}
              {isEditing}
              onChange={onBrandEdit}
            />
          {/if}
        {:catch}
          <p class="text-sm text-error" role="alert">{m.resource_action_failed()}</p>
        {/await}
      {/if}
      {#if isEditing && (!association || replacementRevision)}
        {#if replacementRevision}
          <Button
            type="button"
            text={m.feature_place_change_cancel()}
            disabled={busy}
            onClick={() => {
              replacementRevision = null
              selected = null
              results = null
              localResults = null
            }}
          />
        {/if}
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
        {#if !failed &&
          !searchFailed &&
          results?.length === 0 &&
          localResults?.length === 0}
          <p class="text-sm text-muted-foreground">{m.feature_place_no_results()}</p>
        {/if}
        {#if localResults?.length}
          <h3 class="text-sm font-semibold">{m.feature_place_project_results()}</h3>
          <ul class="max-h-72 space-y-2 overflow-y-auto">
            {#each localResults as candidate (candidate.placeId)}
              <li>
                <button
                  type="button"
                  class="w-full rounded-xl border border-border bg-panel p-4 text-left hover:bg-muted disabled:opacity-50"
                  disabled={busy}
                  onclick={() => (selected = { status: 'ready', ...candidate })}
                >
                  <span class="block font-medium"
                    >{Object.values(candidate.facts.names).join(' · ')}</span
                  >
                  <span class="block text-sm text-muted-foreground"
                    >{candidate.state === 'manual'
                      ? m.feature_place_manual_kind()
                      : m.feature_place_unresolved_kind()}</span
                  >
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if results?.length}
          <h3 class="text-sm font-semibold">{m.feature_place_source_results()}</h3>
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
              text={replacementRevision
                ? m.feature_place_change_confirm()
                : m.feature_place_link()}
              onClick={link}
              disabled={busy || isDirty}
            />
          </div>
        {/if}
        {#if isDirty && selected?.status !== 'ready'}
          <p class="text-sm text-muted-foreground">{m.feature_place_save_first()}</p>
        {/if}
        <CreateLocalPlace
          {projectId}
          {coordinates}
          disabled={busy || isDirty}
          onCreated={value => {
            selected = { status: 'ready', ...value }
            results = null
            localResults = null
          }}
        />
      {:else if !association}
        <p class="text-sm text-muted-foreground">{m.feature_place_unlinked()}</p>
      {/if}
    {:catch}
      <p role="alert" class="text-sm text-destructive">{m.feature_place_failed()}</p>
    {/await}
    <PlaceReviewSection
      {featureId}
      associationRevision={accepted.current?.revision ?? ''}
      {modifiedAt}
      {isDirty}
      onCommitted={onSourceUpdate}
    />
    {#if searchFailed}
      <p role="alert" class="text-sm text-muted-foreground">
        {m.feature_place_search_partial()}
      </p>
    {/if}
    {#if failed}
      <p role="alert" class="text-sm text-destructive">{m.feature_place_failed()}</p>
    {/if}
  </div>
</section>
