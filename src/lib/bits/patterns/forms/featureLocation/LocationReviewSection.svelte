<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import { getFeatureLocation } from '#lib/api/location.remote.js'
import {
  listFeatureLocationReviews,
  reviewLatestLocalLocation,
  getFeatureLocationReview,
  reevaluateFeatureLocationReview,
  acceptFeatureLocationReview,
  rejectFeatureLocationReview,
} from '#lib/api/locationReview.remote.js'
// COMPONENTS
import AddressBlocks from '../formFeatureAddress/AddressBlocks.svelte'
import { positionAddress } from '#lib/addresses/blocks.js'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import RejectIcon from 'virtual:icons/proicons/cancel-circle'
import LocationIcon from 'virtual:icons/proicons/location'
import RefreshIcon from 'virtual:icons/lucide/refresh-cw'
import type {
  LocationReviewActions,
  LocationReviewPresentation,
} from '#lib/locations/reviewPresentation.js'
import PlacementReviewSection from './PlacementReviewSection.svelte'
// DOMAIN
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
import { lifecycleStatus } from '#lib/locations/lifecycle.js'
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// TYPES
import type { LocationFacts, LocationPosition } from '#lib/locations/model.js'
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'

type Review = Awaited<ReturnType<typeof getFeatureLocationReview>>
type Page = Awaited<ReturnType<typeof listFeatureLocationReviews>>
type Group = 'facts' | 'location'
let {
  featureId,
  proposalId,
  onlyGroup,
  associationRevision,
  isLocal = false,
  modifiedAt,
  isDirty,
  onCommitted,
  onActionsChange,
  onPresentationChange,
}: {
  featureId: string
  proposalId?: string
  onlyGroup?: Group
  isLocal?: boolean
  associationRevision: string
  modifiedAt: string
  isDirty: boolean
  onActionsChange?: LocationReviewActions
  onPresentationChange?: (value: LocationReviewPresentation) => void
  onCommitted: () => Promise<void>
} = $props()
let page = $state<Page | null>(null)
let cursor = $state<number | undefined>()
let detail = $state<Review | null>(null)
let busy = $state(false)
let failure = $state('')
let reason = $state('')

// The route owns the header; review components supply guarded actions and immutable map evidence.
$effect(() => {
  const plan = detail?.proposal.evidence.plan
  const placement = detail?.proposal.evidence.placement
  if (plan?.source)
    onPresentationChange?.({
      before: {
        ...plan.source.beforeLocation,
        geometry:
          placement?.beforeGeometry &&
          typeof placement.beforeGeometry === 'object' &&
          'coordinates' in placement.beforeGeometry
            ? (placement.beforeGeometry as LocationPosition['geometry'])
            : plan.source.beforeLocation.geometry,
      },
      after: {
        ...plan.source.candidate.location,
        geometry: placement?.geometry ?? plan.source.candidate.location.geometry,
      },
    })
  if (!onActionsChange || placement) return
  const group = onlyGroup ?? 'location'
  const decided = detail?.decisions.some(item => item.fieldGroup === group)
  const disabled =
    busy || isDirty || !detail || !associationRevision || !reason.trim() || decided
  onActionsChange([
    {
      text: m.location_review_refresh_short(),
      icon: RefreshIcon,
      color: 'neutral',
      style: 'ghost',
      disabled: busy || isDirty || !detail || decided,
      onClick: () => void reevaluate(),
      attrs: { title: m.location_review_refresh_help() },
    },
    {
      text: m.location_review_reject(),
      icon: RejectIcon,
      color: 'error',
      style: 'ghost',
      disabled,
      onClick: () => void decide(group, 'reject'),
    },
    {
      text: m.location_review_accept(),
      icon: CheckIcon,
      color: 'success',
      style: 'ghost',
      disabled: disabled || blocked(group),
      onClick: () => void decide(group, 'accept'),
    },
  ])
})

// Opening a relevant task loads its pending comparison without another manual history request.
$effect(() => {
  const currentFeature = featureId
  const selectedProposal = proposalId
  untrack(() => {
    if (selectedProposal) {
      void select(selectedProposal)
      return
    }
    void load().then(() => {
      const pending = page?.reviews.find(review => review.decidedGroups < 2)
      if (featureId === currentFeature && pending) void select(pending.id)
    })
  })
})

/** Load a bounded page, keeping the settled list visible while the next page arrives. */
async function load(beforeRow?: number): Promise<void> {
  if (busy) return
  busy = true
  failure = ''
  try {
    const query = listFeatureLocationReviews({ featureId, beforeRow })
    await query.refresh()
    page = await query
    cursor = beforeRow
  } catch {
    failure = m.resource_action_failed()
  } finally {
    busy = false
  }
}

/** Prepare the latest local revision for explicit review; never accept it from a read. */
async function latestLocal(): Promise<void> {
  if (busy || isDirty) return
  busy = true
  failure = ''
  try {
    detail = await reviewLatestLocalLocation({ featureId })
    const query = listFeatureLocationReviews({ featureId })
    await query.refresh()
    page = await query
    reason = ''
  } catch {
    failure = m.resource_action_failed()
  } finally {
    busy = false
  }
}

/** Read immutable evidence before enabling a decision; prior content remains during loading. */
async function select(proposalId: string): Promise<void> {
  if (busy) return
  busy = true
  failure = ''
  try {
    const query = getFeatureLocationReview({ featureId, proposalId })
    await query.refresh()
    detail = await query
    reason = ''
  } catch {
    failure = m.resource_action_failed()
  } finally {
    busy = false
  }
}

/** Refresh pending evidence explicitly without reopening previously decided groups. */
async function reevaluate(): Promise<void> {
  if (!detail || busy || isDirty || !associationRevision) return
  busy = true
  failure = ''
  try {
    detail = await reevaluateFeatureLocationReview({
      featureId,
      proposalId: detail.proposal.id,
    })
    const query = listFeatureLocationReviews({ featureId, beforeRow: cursor })
    await query.refresh()
    page = await query
  } catch {
    failure = m.location_review_conflict()
  } finally {
    busy = false
  }
}

/** Commit one group decision, then refresh the ordinary Feature form and comparison state. */
async function decide(fieldGroup: Group, action: 'accept' | 'reject'): Promise<void> {
  if (!detail || busy || isDirty || !associationRevision || !reason.trim()) return
  busy = true
  failure = ''
  const proposalId = detail.proposal.id
  try {
    const input = {
      featureId,
      proposalId,
      fieldGroup,
      expectedRevision: associationRevision,
      expectedFeatureModifiedAt: modifiedAt,
      reason: reason.trim(),
    }
    const result =
      action === 'accept'
        ? await acceptFeatureLocationReview(input).updates(
            getFeatureLocation({ featureId }),
          )
        : await rejectFeatureLocationReview(input)
    if ('status' in result && result.status === 'review') {
      failure = result.reason
      return
    }
    await onCommitted()
    const query = getFeatureLocationReview({ featureId, proposalId })
    await query.refresh()
    detail = await query
    const list = listFeatureLocationReviews({ featureId, beforeRow: cursor })
    await list.refresh()
    page = await list
    reason = ''
  } catch {
    failure = m.location_review_conflict()
  } finally {
    busy = false
  }
}

/** Present every localized value rather than silently choosing one name. */
function names(values: Record<string, string | null>): string {
  return (
    Object.entries(values)
      .filter(([, value]) => value)
      .map(([locale, value]) => locale + ': ' + value)
      .join(' · ') || '—'
  )
}

/** Present brand names and identities so identity-only source changes remain visible. */
function brands(values: LocationFacts['brands'] | null): string {
  return (
    values
      ?.map(
        value =>
          names(value.names) +
          (Object.keys(value.identifiers).length
            ? ' (' +
              Object.entries(value.identifiers)
                .map(([key, id]) => key + ': ' + id)
                .join(', ') +
              ')'
            : ''),
      )
      .join(' / ') || '—'
  )
}

/** Render the mirrored SaanSeoi address with all supported localized displays. */
function address(location: LocationPosition | null): string {
  if (!location) return '—'
  const value = {
    version: 1 as const,
    source: location.address,
    coordinates: location.geometry.coordinates,
    matchStatus: location.address.status,
    overrides: {},
  }
  return (
    [
      ...new Set(
        (['en', 'zhHant', 'zhHans'] as const)
          .map(locale => getAddressDisplay(value, locale))
          .filter(Boolean),
      ),
    ].join(' · ') || '—'
  )
}

/** Build consistent human-readable comparison rows for a source/effective group. */
function rows(
  value: LocationFacts | EffectiveLocationFacts,
  group: Group,
): Array<{ label: string; value: string }> {
  return group === 'facts'
    ? [
        {
          label: m.location_lifecycle_title(),
          value: lifecycleLabel(lifecycleStatus(value)),
        },
        { label: m.location_successor_id(), value: value.successorLocationId ?? '—' },
        { label: m.location_review_names(), value: names(value.names) },
        {
          label: m.location_reset_phones(),
          value: value.phoneNumber?.join(' · ') || '—',
        },
        { label: m.location_brand_title(), value: brands(value.brands) },
        { label: 'Branch', value: names(value.branch ?? {}) },
        { label: 'Format', value: names(value.format ?? {}) },
        { label: 'Branch ID', value: value.branchId || '—' },
        { label: 'Brand ID', value: value.brandId || '—' },
        { label: 'Group ID', value: value.groupId || '—' },
      ]
    : [
        {
          label: m.location_review_coordinates(),
          value:
            value.location?.geometry.coordinates.map(n => n.toFixed(6)).join(', ') ||
            '—',
        },
        { label: m.location_reset_location(), value: address(value.location) },
      ]
}

/** Present the source category vocabulary, including alternate taxonomy labels. */
function categories(
  value:
    | { basicCategory: string | null; taxonomy: Record<string, unknown> }
    | null
    | undefined,
): string {
  if (!value) return '—'
  return (
    [
      ...new Set(
        [value.basicCategory, ...Object.values(value.taxonomy).flat(2)].filter(
          item => typeof item === 'string',
        ),
      ),
    ].join(' / ') || '—'
  )
}

/** Dependency failures cannot be overridden by clicking accept. */
function blocked(group: Group): boolean {
  return Boolean(
    detail?.proposal.evidence.plan.blockers.some(
      value =>
        value !== 'lifecycle-review' &&
        (group === 'location' || value !== 'address-dependencies'),
    ),
  )
}
</script>

<section class="bits-form__section" aria-label={m.location_review_title()}>
  <SectionHeader
    title={onlyGroup === 'facts'
      ? m.location_review_facts()
      : m.location_reset_location()}
    icon={LocationIcon}
    description={m.location_review_description()}
  />
  <div class="flex flex-col gap-5 px-6 pt-5 pb-4">
    {#if isLocal}
      <Button
        text={m.location_address_review_latest()}
        disabled={busy || isDirty}
        onClick={latestLocal}
      />
    {/if}

    <details
      class="border-border text-muted-foreground order-last border-t pt-4 text-sm"
    >
      <summary class="cursor-pointer">{m.location_review_history()}</summary>
      <div class="space-y-3 py-3">
        <Button
          type="button"
          text={m.location_review_load_history()}
          disabled={busy}
          onClick={() => void load()}
        />
        {#if page}
          {#if !page.reviews.length}
            <p class="text-muted-foreground text-sm">{m.location_review_empty()}</p>
          {/if}
          <div class="flex flex-wrap gap-2">
            {#each page.reviews as review}
              <Button
                type="button"
                text={m.location_review_history_entry({
                  date: new Date(review.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  count: String(review.decidedGroups),
                })}
                attrs={{ 'aria-pressed': detail?.proposal.id === review.id }}
                disabled={busy}
                onClick={() => void select(review.id)}
              />
            {/each}
          </div>
          {#if page.nextCursor}
            <Button
              type="button"
              text={m.location_review_older()}
              disabled={busy}
              onClick={() => void load(page?.nextCursor ?? undefined)}
            />
          {/if}
        {/if}
      </div>
    </details>
    {#if detail}
      {@const plan = detail.proposal.evidence.plan}
      <div class="space-y-5">
        {#if !onActionsChange}
          <p class="text-muted-foreground text-sm">{m.location_review_overrides()}</p>
        {/if}
        {#if isDirty}
          <p class="text-sm">{m.location_review_clean_form()}</p>
        {/if}
        {#if !onActionsChange}
          <Button
            type="button"
            text={m.location_review_refresh_short()}
            disabled={busy ||
              isDirty ||
              !associationRevision ||
              detail.decisions.length === 2}
            onClick={() => void reevaluate()}
            attrs={{ 'data-tooltip': m.location_review_refresh_help() }}
          />
        {/if}
        {#if detail.proposal.evidence.placement}
          {#key detail.proposal.id}
            <PlacementReviewSection
              {featureId}
              proposalId={detail.proposal.id}
              placement={detail.proposal.evidence.placement}
              beforeAddress={plan.source
                ? positionAddress(plan.source.beforeLocation)
                : undefined}
              {associationRevision}
              {modifiedAt}
              {isDirty}
              decided={detail.decisions.some(d => d.fieldGroup === 'location')}
              {onCommitted}
              {onActionsChange}
            />
          {/key}
        {:else if plan.source && plan.candidate}
          {#each onlyGroup ? [onlyGroup] : ['facts', 'location'] as group}
            {@const fieldGroup = group as Group}
            {@const decision = detail.decisions.find(
              value => value.fieldGroup === group,
            )}
            {@const before = {
              ...plan.source.beforeFacts,
              location: plan.source.beforeLocation,
            }}
            {@const previousRows = rows(before, fieldGroup)}
            {@const nextRows = rows(plan.source.candidate, fieldGroup)}
            <div class="space-y-4">
              {#if !onlyGroup}
                <h3 class="font-semibold">
                  {group === 'facts'
                    ? m.location_review_facts()
                    : m.location_reset_location()}
                </h3>
              {/if}
              {#if fieldGroup === 'location'}
                <AddressBlocks
                  before={positionAddress(before.location)}
                  address={positionAddress(plan.source.candidate.location)}
                />
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full table-fixed text-left text-sm">
                    <thead>
                      <tr>
                        <th class="w-1/5 p-2"></th>
                        <th class="p-2">{m.location_review_before()}</th>
                        <th class="p-2">{m.location_review_candidate()}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each previousRows as row, index}
                        <tr class="border-border border-t align-top">
                          <th class="p-2 font-medium break-words">{row.label}</th>
                          <td class="p-2 break-words">{row.value}</td>
                          <td class="p-2 break-words">{nextRows[index].value}</td>
                        </tr>
                      {/each}

                      {#if fieldGroup === 'facts'}
                        <tr class="border-border border-t align-top">
                          <th class="p-2 font-medium break-words">
                            {m.location_review_category()}
                          </th>
                          <td class="p-2 break-words">
                            {categories(plan.source.establishmentBefore)}
                          </td>
                          <td class="p-2 break-words">
                            {categories(plan.source.establishmentCandidate)}
                          </td>
                        </tr>
                        <tr class="border-border border-t align-top">
                          <th class="p-2 font-medium break-words">
                            {m.location_review_operating_status()}
                          </th>
                          <td class="p-2 break-words">
                            {plan.source.establishmentBefore?.operatingStatus ?? '—'}
                          </td>
                          <td class="p-2 break-words">
                            {plan.source.establishmentCandidate?.operatingStatus ?? '—'}
                          </td>
                        </tr>
                      {/if}
                    </tbody>
                  </table>
                </div>
              {/if}
              <details class="text-sm">
                <summary class="cursor-pointer">
                  {m.location_review_effective()}
                </summary>
                {#if fieldGroup === 'location'}
                  <AddressBlocks address={positionAddress(plan.candidate.location)} />
                {:else}
                  <dl class="mt-2 space-y-2">
                    {#each rows(plan.candidate, fieldGroup) as row}
                      <div>
                        <dt class="font-medium">{row.label}</dt>
                        <dd class="break-words">{row.value}</dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </details>
              {#if decision}
                <p class="font-medium">
                  {decision.action === 'applied'
                    ? m.location_review_accepted()
                    : m.location_review_rejected()}
                </p>
                <p class="text-muted-foreground text-sm">{decision.reason}</p>
              {:else}
                {#if blocked(fieldGroup)}
                  <p class="text-sm">{m.location_review_dependencies()}</p>
                {/if}
                {#if !onActionsChange}
                  <div class="flex gap-2">
                    <Button
                      type="button"
                      text={m.location_review_accept()}
                      disabled={busy ||
                        isDirty ||
                        !associationRevision ||
                        !reason.trim() ||
                        blocked(fieldGroup)}
                      onClick={() => void decide(fieldGroup, 'accept')}
                    />
                    <Button
                      type="button"
                      text={m.location_review_reject()}
                      disabled={busy ||
                        isDirty ||
                        !associationRevision ||
                        !reason.trim()}
                      onClick={() => void decide(fieldGroup, 'reject')}
                    />
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
          <p class="text-muted-foreground text-sm">{m.location_review_reason_help()}</p>
          <TextInput
            id="location-review-reason"
            name=""
            label={m.location_review_reason()}
            value={reason}
            isEditing={!busy}
            inputAttrs={{ maxlength: 2000 }}
            onValueChange={value => (reason = value)}
          />
        {:else}
          <p>{m.location_review_refresh_evidence()}</p>
        {/if}
      </div>
    {/if}
    {#if failure}
      <p class="text-error text-sm" role="alert">{failure}</p>
    {/if}
  </div>
</section>
