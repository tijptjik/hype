<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import {
  getFeatureLocation,
  searchFeatureLocations,
  getFeatureLocationCandidate,
  importFeatureLocationCandidate,
} from '#lib/api/location.remote.js'
import {
  getLocationIdentityReviewAccess,
  prepareMirroredLocationIdentityReview,
  getLocationIdentityReview,
  acceptLocationIdentityReview,
  rejectLocationIdentityReview,
  prepareLocationMergeReview,
  getLocationMergeReview,
  acceptLocationMergeReview,
} from '#lib/api/locationIdentity.remote.js'
// DOMAIN
import AddressBlocks from '../formFeatureAddress/AddressBlocks.svelte'
import { positionAddress } from '#lib/addresses/blocks.js'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import RejectIcon from 'virtual:icons/proicons/cancel-circle'
import LocationIcon from 'virtual:icons/proicons/location'
import MergeIcon from 'virtual:icons/lucide/merge'
import type {
  LocationReviewActions,
  LocationReviewPresentation,
} from '#lib/locations/reviewPresentation.js'
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// TYPES
import type { LocationFacts } from '#lib/locations/model.js'
import type { LocationSearchCandidate } from '#lib/locations/sourceClient.js'

type Review = Awaited<ReturnType<typeof getLocationIdentityReview>>
let {
  featureId,
  locationId,
  initialReviewId,
  initialMergeReviewId,
  mergeRequired = false,
  isDirty,
  onCommitted,
  onActionsChange,
  onPresentationChange,
}: {
  featureId: string
  locationId: string
  initialReviewId?: string
  initialMergeReviewId?: string | null
  mergeRequired?: boolean
  isDirty: boolean
  onActionsChange?: LocationReviewActions
  onPresentationChange?: (value: LocationReviewPresentation) => void
  onCommitted: () => Promise<void>
} = $props()
const access = $derived(getLocationIdentityReviewAccess({ locationId }))
let open = $state(false)
let query = $state('')
let results = $state<LocationSearchCandidate[] | null>(null)
let detail = $state<Review | null>(null)
let reason = $state('')
let busy = $state(false)
let failure = $state('')
let outcome = $state<
  'applied' | 'unchanged' | 'merge-required' | 'merged' | 'rejected' | null
>(null)
let merge = $state<Awaited<ReturnType<typeof getLocationMergeReview>> | null>(null)
let mergeReason = $state('')
let alive = true
onDestroy(() => {
  alive = false
})

// Retained identity evidence drives the same Profile map and toolbar as address reviews.
$effect(() => {
  if (detail)
    onPresentationChange?.({
      before: detail.before.location,
      after: detail.candidate.facts.location,
    })
  if (!onActionsChange) return
  const disabled = busy || isDirty || !detail || detail.stale || detail.rejected
  onActionsChange(
    outcome === 'merge-required'
      ? [
          {
            text: m.location_merge_review(),
            icon: MergeIcon,
            style: 'ghost',
            color: 'warning',
            disabled: busy || isDirty || !detail,
            onClick: () => void reviewMerge(),
          },
          ...(merge
            ? [
                {
                  text: m.location_merge_confirm(),
                  icon: CheckIcon,
                  style: 'ghost' as const,
                  color: 'success' as const,
                  disabled:
                    disabled ||
                    !mergeReason.trim() ||
                    !merge.canApply ||
                    merge.stale ||
                    merge.applied,
                  onClick: () => void confirmMerge(),
                },
              ]
            : []),
        ]
      : [
          {
            text: m.location_identity_reject(),
            icon: RejectIcon,
            style: 'ghost',
            color: 'error',
            disabled: disabled || Boolean(outcome) || !reason.trim(),
            onClick: () => void reject(),
          },
          {
            text: m.location_identity_accept(),
            icon: CheckIcon,
            style: 'ghost',
            color: 'success',
            disabled: disabled || Boolean(outcome) || !reason.trim(),
            onClick: () => void accept(),
          },
        ],
  )
})

// Queue navigation reads the exact retained comparison, never preparing or accepting a new one.
$effect(() => {
  const reviewId = initialReviewId
  const mergeId = initialMergeReviewId
  const target = locationId
  if (!reviewId) return
  untrack(() => {
    void (async () => {
      busy = true
      try {
        const comparison = await getLocationIdentityReview({
          locationId: target,
          reviewId,
        })
        if (!alive) return
        detail = comparison
        open = true
        if (mergeRequired) outcome = 'merge-required'
        if (mergeId)
          merge = await getLocationMergeReview({
            locationId: target,
            reviewId: mergeId,
          })
      } catch {
        if (alive) failure = m.location_identity_stale()
      } finally {
        if (alive) busy = false
      }
    })()
  })
})

/** Keep settled candidates and comparisons visible while a new search is pending. */
async function search(): Promise<void> {
  if (busy || !query.trim()) return
  busy = true
  failure = ''
  try {
    // An explicit search must see decisions saved since this native query was cached.
    const request = searchFeatureLocations({ featureId, q: query.trim() })
    await request.refresh()
    const found = await request
    if (alive) results = found.candidates
  } catch {
    if (alive) failure = m.resource_action_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Capture only the exact server-resolved source revision selected for this Location. */
async function select(candidate: LocationSearchCandidate): Promise<void> {
  if (busy || isDirty) return
  busy = true
  failure = ''
  try {
    let resolved = await getFeatureLocationCandidate({
      featureId,
      ssId: candidate.placeId,
      resourceReleaseId: candidate.resourceReleaseId,
    })
    if (!alive) return
    if (
      resolved.status === 'source-import-needed' ||
      (resolved.facts.location.address.status !== 'resolved' &&
        Boolean(
          resolved.facts.location.address.address2dId ||
            resolved.facts.location.address.address3dId ||
            resolved.facts.location.address.address3dUnitId,
        ))
    ) {
      resolved = await importFeatureLocationCandidate({
        featureId,
        ssId: candidate.placeId,
        resourceReleaseId: candidate.resourceReleaseId,
      })
    }
    if (!alive) return
    if (resolved.status !== 'ready') {
      failure = m.feature_location_import_needed()
      return
    }
    const prepared = await prepareMirroredLocationIdentityReview({
      locationId,
      candidateRevisionId: resolved.revisionId,
    })
    if (!alive) return
    const comparison = await getLocationIdentityReview({
      locationId,
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

/** Retain a negative identity decision without changing source or Feature facts. */
async function reject(): Promise<void> {
  if (
    !detail ||
    detail.stale ||
    detail.rejected ||
    busy ||
    isDirty ||
    !reason.trim() ||
    outcome
  )
    return
  busy = true
  failure = ''
  try {
    await rejectLocationIdentityReview({
      locationId,
      reviewId: detail.id,
      reason: reason.trim(),
    })
    if (!alive) return
    outcome = 'rejected'
    results =
      results?.filter(candidate => candidate.placeId !== detail?.candidate.ssId) ?? null
  } catch {
    if (alive) failure = m.location_identity_stale()
  } finally {
    if (alive) busy = false
  }
}

/** Accept the retained identity comparison without changing Feature values or overrides. */
async function accept(): Promise<void> {
  if (
    !detail ||
    detail.stale ||
    detail.rejected ||
    busy ||
    isDirty ||
    !reason.trim() ||
    outcome
  )
    return
  busy = true
  failure = ''
  try {
    const result = await acceptLocationIdentityReview({
      locationId,
      reviewId: detail.id,
      reason: reason.trim(),
    }).updates(getFeatureLocation({ featureId }))
    if (!alive) return
    if (result.status === 'conflict') {
      failure = m.location_identity_stale()
      return
    }
    outcome = result.status
    if (result.status !== 'merge-required') await onCommitted()
  } catch {
    if (alive) failure = m.location_identity_stale()
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
    const prepared = await prepareLocationMergeReview({
      locationId,
      identityReviewId: detail.id,
    })
    if (!alive) return
    if (prepared.status !== 'ready') {
      failure = m.location_merge_scope()
      return
    }
    const impact = await getLocationMergeReview({
      locationId,
      reviewId: prepared.reviewId,
    })
    if (alive) {
      merge = impact
      mergeReason = ''
    }
  } catch {
    if (alive) failure = m.location_merge_failed()
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
    const result = await acceptLocationMergeReview({
      locationId,
      reviewId: merge.reviewId,
      reason: mergeReason.trim(),
    }).updates(getFeatureLocation({ featureId }))
    if (!alive) return
    if (result.status !== 'applied') {
      failure = m.location_identity_stale()
      return
    }
    outcome = 'merged'
    await onCommitted()
  } catch {
    if (alive) failure = m.location_merge_failed()
  } finally {
    if (alive) busy = false
  }
}

/** Present complete localized Location facts without exposing the raw source payload. */
function rows(facts: LocationFacts): Array<{ label: string; value: string }> {
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
      label: m.location_review_names(),
      value: Object.values(facts.names).join(' · ') || '—',
    },
    { label: m.location_reset_phones(), value: facts.phoneNumber.join(' · ') || '—' },
    {
      label: m.location_brand_title(),
      value:
        facts.brands.map(brand => Object.values(brand.names).join(' · ')).join(' / ') ||
        '—',
    },
    {
      label: m.location_review_coordinates(),
      value: location.geometry.coordinates.map(value => value.toFixed(6)).join(', '),
    },
    {
      label: m.location_reset_location(),
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
    <section class="bits-form__section" aria-label={m.location_identity_title()}>
      <SectionHeader
        title={m.location_identity_title()}
        icon={mergeRequired ? MergeIcon : LocationIcon}
      />
      <div class="space-y-4 px-6 pt-5 pb-4">
        {#if !onActionsChange}
          <Button
            type="button"
            text={m.location_identity_open()}
            disabled={busy}
            attrs={{ 'aria-expanded': open }}
            onClick={() => {
              open = !open
            }}
          />
        {/if}
        {#if open}
          {#if !onActionsChange}
            <p class="text-muted-foreground text-sm">
              {m.location_identity_preserve()}
            </p>
          {/if}
          {#if isDirty}
            <p role="status" class="text-muted-foreground text-sm">
              {m.feature_location_save_first()}
            </p>
          {/if}
          {#if !onActionsChange}
            <div class="flex items-end gap-3">
              <TextInput
                id="location-identity-search"
                name=""
                label={m.feature_location_search_label()}
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
                text={m.feature_location_search()}
                disabled={busy || !query.trim()}
                onClick={search}
              />
            </div>
          {/if}
          {#if results?.length === 0}
            <p class="text-muted-foreground text-sm">
              {m.feature_location_no_results()}
            </p>
          {/if}
          {#if results?.length}
            <ul class="max-h-72 space-y-2 overflow-y-auto">
              {#each results as candidate}
                <li>
                  <button
                    type="button"
                    class="border-border bg-panel hover:bg-muted w-full rounded-xl border p-4 text-left disabled:opacity-50"
                    disabled={busy || isDirty}
                    onclick={() => void select(candidate)}
                  >
                    <span class="block font-medium"
                      >{candidate.nameText ?? candidate.placeId}</span
                    >
                    {#if candidate.previouslyRejected}
                      <span class="text-muted-foreground block text-sm"
                        >{m.location_identity_previously_rejected()}</span
                      >
                    {/if}
                    {#if candidate.brandText}
                      <span class="text-muted-foreground block text-sm"
                        >{candidate.brandText}</span
                      >
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if detail}
            <div class="space-y-5">
              {#if detail.rematch}
                <p class="text-muted-foreground text-sm">
                  {m.location_rematch_evidence({
                    score: String(detail.rematch.score),
                    distance: String(Math.round(detail.rematch.distance)),
                  })}
                </p>
                <p class="text-muted-foreground text-sm">
                  {m.location_rematch_preserve()}
                </p>
                {#if detail.rematch.numberConflict}
                  <p role="status">{m.location_rematch_number_conflict()}</p>
                {/if}
                {#if detail.rematch.incomplete}
                  <p role="status">{m.location_rematch_coverage()}</p>
                {/if}
              {/if}
              <div class="md:divide-border grid gap-y-5 md:grid-cols-2 md:divide-x">
                {#each [
                  { title: m.location_identity_current(), facts: detail.before },
                  {
                    title: m.location_review_candidate(),
                    facts: detail.candidate.facts,
                  },
                ] as column}
                  <div class="min-w-0 space-y-3 md:first:pr-6 md:last:pl-6">
                    <h3 class="font-semibold">{column.title}</h3>
                    <div class="space-y-3">
                      {#each rows(column.facts).filter(
                        row =>
                          row.label !== m.location_review_coordinates() &&
                          row.label !== m.location_reset_location(),
                      ) as row, index}
                        <TextInput
                          id={`location-identity-${column.title}-${index}`}
                          name=""
                          label={row.label}
                          value={row.value}
                          isEditing={false}
                        />
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
              <div class="-mx-6">
                <SectionHeader
                  title={m.location_reset_location()}
                  icon={LocationIcon}
                />
              </div>
              <AddressBlocks
                before={positionAddress(detail.before.location)}
                address={positionAddress(detail.candidate.facts.location)}
              />
              {#if detail.candidate.issueKinds.length}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_identity_incomplete()}
                </p>
              {/if}
              {#if detail.stale}
                <p role="alert" class="text-error text-sm">
                  {m.location_identity_stale()}
                </p>
              {/if}
              {#if outcome === 'merge-required'}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_identity_merge()}
                </p>
                {#if !onActionsChange}
                  <Button
                    type="button"
                    text={m.location_merge_review()}
                    disabled={busy || isDirty}
                    onClick={reviewMerge}
                  />
                {/if}
                {#if merge}
                  <div class="border-border space-y-3 border-t pt-5">
                    <h3 class="font-semibold">{m.location_merge_title()}</h3>
                    <p class="text-sm">
                      {m.location_merge_impact({
                        count: String(merge.affectedFeatures),
                      })}
                    </p>
                    <p class="text-muted-foreground text-sm">
                      {merge.visibility === 'private'
                        ? m.location_merge_private()
                        : m.location_merge_shared()}
                    </p>
                    {#if merge.dependencies}
                      <p class="text-sm">
                        {m.location_merge_dependencies({
                          relationships: String(
                            merge.dependencies.relationshipVersions,
                          ),
                          corrections: String(merge.dependencies.correctionVersions),
                          placements: String(merge.dependencies.acceptedPlacements),
                        })}
                      </p>
                      {#if merge.dependencies.blockers.length}
                        <p role="alert" class="text-error text-sm">
                          {m.location_merge_blocked()}
                        </p>
                        <ul class="list-disc pl-5 text-sm">
                          {#each merge.dependencies.blockers as blocker}
                            <li>
                              {blocker === 'incompatible-location-kinds'
                                ? m.location_merge_kind_conflict()
                                : blocker === 'overlapping-organisation-corrections'
                                  ? m.location_merge_correction_conflict()
                                  : m.location_merge_membership_conflict()}
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    {/if}
                    {#if merge.stale || merge.applied}
                      <p role="status" class="text-error text-sm">
                        {m.location_identity_stale()}
                      </p>
                    {:else}
                      <TextInput
                        id="location-merge-reason"
                        name=""
                        label={m.location_review_reason()}
                        bind:value={mergeReason}
                        inputAttrs={{ maxlength: 2000 }}
                      />
                      {#if !onActionsChange}
                        <Button
                          type="button"
                          text={m.location_merge_confirm()}
                          onClick={confirmMerge}
                          disabled={busy ||
                            isDirty ||
                            !mergeReason.trim() ||
                            !merge.canApply}
                        />
                      {/if}
                    {/if}
                  </div>
                {/if}
              {:else if outcome === 'merged'}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_merge_saved()}
                </p>
              {:else if outcome === 'rejected' || detail.rejected}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_identity_rejected()}
                </p>
              {:else if outcome}
                <p role="status" class="text-muted-foreground text-sm">
                  {m.location_identity_saved()}
                </p>
              {:else}
                <p class="text-muted-foreground text-sm">
                  {m.location_review_reason_help()}
                </p>
                <TextInput
                  id="location-identity-reason"
                  name=""
                  label={m.location_review_reason()}
                  bind:value={reason}
                  inputAttrs={{ maxlength: 2000 }}
                />
                {#if !onActionsChange}
                  <Button
                    type="button"
                    text={m.location_identity_accept()}
                    onClick={accept}
                    disabled={busy || isDirty || detail.stale || !reason.trim()}
                  />
                {/if}
                {#if !onActionsChange}
                  <Button
                    type="button"
                    text={m.location_identity_reject()}
                    onClick={reject}
                    disabled={busy || isDirty || detail.stale || !reason.trim()}
                  />
                {/if}
              {/if}
            </div>
          {/if}
          {#if busy}
            <span
              role="status"
              aria-label="Loading field values"
              aria-busy="true"
              class="sr-only"
            ></span>
          {/if}
          {#if failure}
            <p role="alert" class="text-error text-sm">{failure}</p>
          {/if}
        {/if}
      </div>
    </section>
  {/if}
{:catch}
  <p class="text-error text-sm" role="alert">{m.resource_action_failed()}</p>
{/await}
