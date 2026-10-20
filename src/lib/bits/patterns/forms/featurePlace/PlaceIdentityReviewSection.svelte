<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import {
  getFeaturePlace,
  searchFeaturePlaces,
  getFeaturePlaceCandidate,
} from '#lib/api/place.remote.js'
import {
  getPlaceIdentityReviewAccess,
  prepareMirroredPlaceIdentityReview,
  getPlaceIdentityReview,
  acceptPlaceIdentityReview,
  preparePlaceMergeReview,
  getPlaceMergeReview,
  acceptPlaceMergeReview,
} from '#lib/api/placeIdentity.remote.js'
// DOMAIN
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// TYPES
import type { PlaceFacts } from '#lib/places/model.js'
import type { PlaceSearchCandidate } from '#lib/places/sourceClient.js'

type Review = Awaited<ReturnType<typeof getPlaceIdentityReview>>
let {
  featureId,
  placeId,
  isDirty,
  onCommitted,
}: {
  featureId: string
  placeId: string
  isDirty: boolean
  onCommitted: () => Promise<void>
} = $props()
const access = $derived(getPlaceIdentityReviewAccess({ placeId }))
let open = $state(false)
let query = $state('')
let results = $state<PlaceSearchCandidate[] | null>(null)
let detail = $state<Review | null>(null)
let reason = $state('')
let busy = $state(false)
let failure = $state('')
let outcome = $state<'applied' | 'unchanged' | 'merge-required' | 'merged' | null>(null)
let merge = $state<Awaited<ReturnType<typeof getPlaceMergeReview>> | null>(null)
let mergeReason = $state('')
let alive = true
onDestroy(() => {
  alive = false
})

/** Keep settled candidates and comparisons visible while a new search is pending. */
async function search(): Promise<void> {
  if (busy || !query.trim()) return
  busy = true
  failure = ''
  try {
    const found = await searchFeaturePlaces({ featureId, q: query.trim() })
    if (alive) results = found.candidates
  } catch {
    if (alive) failure = m.resource_action_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Capture only the exact server-resolved source revision selected for this Place. */
async function select(candidate: PlaceSearchCandidate): Promise<void> {
  if (busy || isDirty) return
  busy = true
  failure = ''
  try {
    const resolved = await getFeaturePlaceCandidate({
      featureId,
      ssId: candidate.placeId,
      resourceReleaseId: candidate.resourceReleaseId,
    })
    if (!alive) return
    if (resolved.status !== 'ready') {
      failure = m.feature_place_import_needed()
      return
    }
    const prepared = await prepareMirroredPlaceIdentityReview({
      placeId,
      candidateRevisionId: resolved.revisionId,
    })
    if (!alive) return
    const comparison = await getPlaceIdentityReview({
      placeId,
      reviewId: prepared.reviewId,
    })
    if (alive) {
      detail = comparison
      reason = ''
      outcome = null
      merge = null
      mergeReason = ''
    }
  } catch {
    if (alive) failure = m.resource_action_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Accept the retained identity comparison without changing Feature values or overrides. */
async function accept(): Promise<void> {
  if (!detail || detail.stale || busy || isDirty || !reason.trim() || outcome) return
  busy = true
  failure = ''
  try {
    const result = await acceptPlaceIdentityReview({
      placeId,
      reviewId: detail.id,
      reason: reason.trim(),
    }).updates(getFeaturePlace({ featureId }))
    if (!alive) return
    if (result.status === 'conflict') {
      failure = m.place_identity_stale()
      return
    }
    outcome = result.status
    if (result.status !== 'merge-required') await onCommitted()
  } catch {
    if (alive) failure = m.place_identity_stale()
  } finally {
    if (alive) busy = false
  }
}

/** Review the second identity's impact separately; preparing never performs a merge. */
async function reviewMerge(): Promise<void> {
  if (!detail || busy || isDirty || outcome !== 'merge-required') return
  busy = true
  failure = ''
  try {
    const prepared = await preparePlaceMergeReview({
      placeId,
      identityReviewId: detail.id,
    })
    if (!alive) return
    if (prepared.status !== 'ready') {
      failure = m.place_merge_scope()
      return
    }
    const impact = await getPlaceMergeReview({ placeId, reviewId: prepared.reviewId })
    if (alive) {
      merge = impact
      mergeReason = ''
    }
  } catch {
    if (alive) failure = m.place_merge_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Require a second explicit decision after displaying the captured merge impact. */
async function confirmMerge(): Promise<void> {
  if (!merge || merge.stale || merge.applied || busy || isDirty || !mergeReason.trim())
    return
  busy = true
  failure = ''
  try {
    const result = await acceptPlaceMergeReview({
      placeId,
      reviewId: merge.reviewId,
      reason: mergeReason.trim(),
    }).updates(getFeaturePlace({ featureId }))
    if (!alive) return
    if (result.status !== 'applied') {
      failure = m.place_identity_stale()
      return
    }
    outcome = 'merged'
    await onCommitted()
  } catch {
    if (alive) failure = m.place_merge_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Present complete localized Place facts without exposing the raw source payload. */
function rows(facts: PlaceFacts): Array<{ label: string; value: string }> {
  const location = facts.location
  const address = {
    version: 1 as const,
    source: location.address,
    coordinates: location.geometry.coordinates,
    matchStatus: location.address.status,
    overrides: {},
  }
  return [
    {
      label: m.place_review_names(),
      value: Object.values(facts.names).join(' · ') || '—',
    },
    { label: m.place_reset_phones(), value: facts.phoneNumber.join(' · ') || '—' },
    {
      label: m.place_brand_title(),
      value:
        facts.brands.map(brand => Object.values(brand.names).join(' · ')).join(' / ') ||
        '—',
    },
    {
      label: m.place_review_coordinates(),
      value: location.geometry.coordinates.map(value => value.toFixed(6)).join(', '),
    },
    {
      label: m.place_reset_location(),
      value:
        [
          ...new Set(
            (['en', 'zhHant', 'zhHans'] as const)
              .map(locale => getAddressDisplay(address, locale))
              .filter(Boolean),
          ),
        ].join(' · ') || '—',
    },
  ]
}
</script>

{#await access then permission}
  {#if permission.allowed}
    <section class="space-y-4" aria-label={m.place_identity_title()}>
      <SectionHeader
        title={m.place_identity_title()}
        description={m.place_identity_description()}
      />
      <div class="space-y-4 px-6 pb-4">
        <Button
          type="button"
          text={m.place_identity_open()}
          disabled={busy}
          attrs={{ 'aria-expanded': open }}
          onClick={() => {
            open = !open
          }}
        />
        {#if open}
          <p class="text-sm text-muted-foreground">{m.place_identity_preserve()}</p>
          {#if isDirty}
            <p role="status" class="text-sm text-muted-foreground">
              {m.feature_place_save_first()}
            </p>
          {/if}
          <div class="flex items-end gap-3">
            <TextInput
              id="place-identity-search"
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
              disabled={busy || !query.trim()}
              onClick={search}
            />
          </div>
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
                    disabled={busy || isDirty}
                    onclick={() => void select(candidate)}
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
          {#if detail}
            <div class="space-y-4 rounded-xl border border-border bg-panel p-4">
              <div class="grid gap-4 md:grid-cols-2">
                {#each [
                  { title: m.place_identity_current(), facts: detail.before },
                  { title: m.place_review_candidate(), facts: detail.candidate.facts },
                ] as column}
                  <div class="min-w-0 space-y-3">
                    <h3 class="font-semibold">{column.title}</h3>
                    <dl class="space-y-3">
                      {#each rows(column.facts) as row}
                        <div>
                          <dt class="text-sm text-muted-foreground">{row.label}</dt>
                          <dd class="break-words text-sm">{row.value}</dd>
                        </div>
                      {/each}
                    </dl>
                  </div>
                {/each}
              </div>
              {#if detail.candidate.issueKinds.length}
                <p role="status" class="text-sm text-muted-foreground">
                  {m.place_identity_incomplete()}
                </p>
              {/if}
              {#if detail.stale}
                <p role="alert" class="text-sm text-error">
                  {m.place_identity_stale()}
                </p>
              {/if}
              {#if outcome === 'merge-required'}
                <p role="status" class="text-sm text-muted-foreground">
                  {m.place_identity_merge()}
                </p>
                <Button
                  type="button"
                  text={m.place_merge_review()}
                  disabled={busy || isDirty}
                  onClick={reviewMerge}
                />
                {#if merge}
                  <div class="space-y-3 rounded-xl border border-border p-4">
                    <h3 class="font-semibold">{m.place_merge_title()}</h3>
                    <p class="text-sm">
                      {m.place_merge_impact({ count: String(merge.affectedFeatures) })}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {merge.visibility === 'private'
                        ? m.place_merge_private()
                        : m.place_merge_shared()}
                    </p>
                    {#if merge.stale || merge.applied}
                      <p role="status" class="text-sm text-error">
                        {m.place_identity_stale()}
                      </p>
                    {:else}
                      <TextInput
                        id="place-merge-reason"
                        name=""
                        label={m.place_review_reason()}
                        bind:value={mergeReason}
                        inputAttrs={{ maxlength: 2000 }}
                      />
                      <Button
                        type="button"
                        text={m.place_merge_confirm()}
                        onClick={confirmMerge}
                        disabled={busy || isDirty || !mergeReason.trim()}
                      />
                    {/if}
                  </div>
                {/if}
              {:else if outcome === 'merged'}
                <p role="status" class="text-sm text-muted-foreground">
                  {m.place_merge_saved()}
                </p>
              {:else if outcome}
                <p role="status" class="text-sm text-muted-foreground">
                  {m.place_identity_saved()}
                </p>
              {:else}
                <TextInput
                  id="place-identity-reason"
                  name=""
                  label={m.place_review_reason()}
                  bind:value={reason}
                  inputAttrs={{ maxlength: 2000 }}
                />
                <Button
                  type="button"
                  text={m.place_identity_accept()}
                  onClick={accept}
                  disabled={busy || isDirty || detail.stale || !reason.trim()}
                />
              {/if}
            </div>
          {/if}
          {#if busy}
            <p role="status" class="text-sm text-muted-foreground">
              {m.feature_place_loading()}
            </p>
          {/if}
          {#if failure}
            <p role="alert" class="text-sm text-error">{failure}</p>
          {/if}
        {/if}
      </div>
    </section>
  {/if}
{:catch}
  <p class="text-sm text-error" role="alert">{m.resource_action_failed()}</p>
{/await}
