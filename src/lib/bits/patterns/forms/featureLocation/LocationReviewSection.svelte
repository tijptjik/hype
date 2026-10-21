<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { TextInput } from '#lib/bits/custom/form/index.js'
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
  associationRevision,
  isLocal = false,
  modifiedAt,
  isDirty,
  onCommitted,
}: {
  featureId: string
  isLocal?: boolean
  associationRevision: string
  modifiedAt: string
  isDirty: boolean
  onCommitted: () => Promise<void>
} = $props()
let page = $state<Page | null>(null)
let cursor = $state<number | undefined>()
let detail = $state<Review | null>(null)
let busy = $state(false)
let failure = $state('')
let reason = $state('')

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

<section class="space-y-4" aria-label={m.location_review_title()}>
  <div class="space-y-4 py-4">
    {#if isLocal}
      <Button
        text={m.location_address_review_latest()}
        disabled={busy || isDirty}
        onClick={latestLocal}
      />
    {/if}

    <Button
      type="button"
      text={m.location_review_load()}
      disabled={busy}
      onClick={() => void load()}
    />
    {#if page}
      {#if !page.reviews.length}
        <p class="text-sm text-muted-foreground">{m.location_review_empty()}</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        {#each page.reviews as review}
          <Button
            type="button"
            text={new Date(review.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) +
              ' · ' +
              review.decidedGroups +
              '/2'}
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
    {#if detail}
      {@const plan = detail.proposal.evidence.plan}
      <div class="space-y-4 rounded-xl border border-border bg-panel p-4">
        <p class="text-sm text-muted-foreground">{m.location_review_overrides()}</p>
        {#if isDirty}
          <p class="text-sm">{m.location_review_clean_form()}</p>
        {/if}
        <Button
          type="button"
          text={m.location_review_reevaluate()}
          disabled={busy ||
            isDirty ||
            !associationRevision ||
            detail.decisions.length === 2}
          onClick={() => void reevaluate()}
        />
        {#if plan.source && plan.candidate}
          <TextInput
            id="location-review-reason"
            name=""
            label={m.location_review_reason()}
            value={reason}
            isEditing={!busy}
            inputAttrs={{ maxlength: 2000 }}
            onValueChange={value => (reason = value)}
          />
          {#each ['facts', 'location'] as group}
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
            <div class="space-y-3 rounded-xl border border-border p-4">
              <h3 class="font-semibold">
                {group === 'facts'
                  ? m.location_review_facts()
                  : m.location_reset_location()}
              </h3>
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
                      <tr class="border-t border-border align-top">
                        <th class="break-words p-2 font-medium">{row.label}</th>
                        <td class="break-words p-2">{row.value}</td>
                        <td class="break-words p-2">{nextRows[index].value}</td>
                      </tr>
                    {/each}
                    {#if fieldGroup === 'facts'}
                      <tr class="border-t border-border align-top">
                        <th class="break-words p-2 font-medium">
                          {m.location_review_category()}
                        </th>
                        <td class="break-words p-2">
                          {categories(plan.source.establishmentBefore)}
                        </td>
                        <td class="break-words p-2">
                          {categories(plan.source.establishmentCandidate)}
                        </td>
                      </tr>
                      <tr class="border-t border-border align-top">
                        <th class="break-words p-2 font-medium">
                          {m.location_review_operating_status()}
                        </th>
                        <td class="break-words p-2">
                          {plan.source.establishmentBefore?.operatingStatus ?? '—'}
                        </td>
                        <td class="break-words p-2">
                          {plan.source.establishmentCandidate?.operatingStatus ?? '—'}
                        </td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
              <details class="text-sm">
                <summary class="cursor-pointer">
                  {m.location_review_effective()}
                </summary>
                <dl class="mt-2 space-y-2">
                  {#each rows(plan.candidate, fieldGroup) as row}
                    <div>
                      <dt class="font-medium">{row.label}</dt>
                      <dd class="break-words">{row.value}</dd>
                    </div>
                  {/each}
                </dl>
              </details>
              {#if decision}
                <p class="font-medium">
                  {decision.action === 'applied'
                    ? m.location_review_accepted()
                    : m.location_review_rejected()}
                </p>
                <p class="text-sm text-muted-foreground">{decision.reason}</p>
              {:else}
                {#if blocked(fieldGroup)}
                  <p class="text-sm">{m.location_review_dependencies()}</p>
                {/if}
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
                    disabled={busy || isDirty || !associationRevision || !reason.trim()}
                    onClick={() => void decide(fieldGroup, 'reject')}
                  />
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <p>{m.location_review_refresh_evidence()}</p>
        {/if}
      </div>
    {/if}
    {#if failure}
      <p class="text-sm text-error" role="alert">{failure}</p>
    {/if}
  </div>
</section>
