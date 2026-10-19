<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
// API
import { getFeaturePlace } from '#lib/api/place.remote.js'
import {
  listFeaturePlaceReviews,
  getFeaturePlaceReview,
  reevaluateFeaturePlaceReview,
  acceptFeaturePlaceReview,
  rejectFeaturePlaceReview,
} from '#lib/api/placeReview.remote.js'
// DOMAIN
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// TYPES
import type { PlaceFacts, PlaceLocation } from '#lib/places/model.js'
import type { EffectivePlaceFacts } from '#lib/places/resolve.js'

type Review = Awaited<ReturnType<typeof getFeaturePlaceReview>>
type Page = Awaited<ReturnType<typeof listFeaturePlaceReviews>>
type Group = 'facts' | 'location'
let {
  featureId,
  associationRevision,
  modifiedAt,
  isDirty,
  onCommitted,
}: {
  featureId: string
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
    const query = listFeaturePlaceReviews({ featureId, beforeRow })
    await query.refresh()
    page = await query
    cursor = beforeRow
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
    const query = getFeaturePlaceReview({ featureId, proposalId })
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
    detail = await reevaluateFeaturePlaceReview({
      featureId,
      proposalId: detail.proposal.id,
    })
    const query = listFeaturePlaceReviews({ featureId, beforeRow: cursor })
    await query.refresh()
    page = await query
  } catch {
    failure = m.place_review_conflict()
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
        ? await acceptFeaturePlaceReview(input).updates(getFeaturePlace({ featureId }))
        : await rejectFeaturePlaceReview(input)
    if ('status' in result && result.status === 'review') {
      failure = result.reason
      return
    }
    await onCommitted()
    const query = getFeaturePlaceReview({ featureId, proposalId })
    await query.refresh()
    detail = await query
    const list = listFeaturePlaceReviews({ featureId, beforeRow: cursor })
    await list.refresh()
    page = await list
    reason = ''
  } catch {
    failure = m.place_review_conflict()
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
function brands(values: PlaceFacts['brands'] | null): string {
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
function address(location: PlaceLocation | null): string {
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
  value: PlaceFacts | EffectivePlaceFacts,
  group: Group,
): Array<{ label: string; value: string }> {
  return group === 'facts'
    ? [
        { label: m.place_review_names(), value: names(value.names) },
        { label: m.place_reset_phones(), value: value.phoneNumber?.join(' · ') || '—' },
        { label: m.place_brand_title(), value: brands(value.brands) },
      ]
    : [
        {
          label: m.place_review_coordinates(),
          value:
            value.location?.geometry.coordinates.map(n => n.toFixed(6)).join(', ') ||
            '—',
        },
        { label: m.place_reset_location(), value: address(value.location) },
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
      value => group === 'location' || value !== 'address-dependencies',
    ),
  )
}
</script>

<section class="space-y-4" aria-label={m.place_review_title()}>
  <SectionHeader
    title={m.place_review_title()}
    description={m.place_review_description()}
  />
  <div class="space-y-4 px-6 pb-4">
    <Button
      type="button"
      text={m.place_review_load()}
      disabled={busy}
      onClick={() => void load()}
    />
    {#if page}
      {#if !page.reviews.length}
        <p class="text-sm text-muted-foreground">{m.place_review_empty()}</p>
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
          text={m.place_review_older()}
          disabled={busy}
          onClick={() => void load(page?.nextCursor ?? undefined)}
        />
      {/if}
    {/if}
    {#if detail}
      {@const plan = detail.proposal.evidence.plan}
      <div class="space-y-4 rounded-xl border border-border bg-panel p-4">
        <p class="text-sm text-muted-foreground">{m.place_review_overrides()}</p>
        {#if isDirty}
          <p class="text-sm">{m.place_review_clean_form()}</p>
        {/if}
        <Button
          type="button"
          text={m.place_review_reevaluate()}
          disabled={busy ||
            isDirty ||
            !associationRevision ||
            detail.decisions.length === 2}
          onClick={() => void reevaluate()}
        />
        {#if plan.source && plan.candidate}
          <TextInput
            id="place-review-reason"
            name=""
            label={m.place_review_reason()}
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
                {group === 'facts' ? m.place_review_facts() : m.place_reset_location()}
              </h3>
              <div class="overflow-x-auto">
                <table class="w-full table-fixed text-left text-sm">
                  <thead>
                    <tr>
                      <th class="w-1/5 p-2"></th>
                      <th class="p-2">{m.place_review_before()}</th>
                      <th class="p-2">{m.place_review_candidate()}</th>
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
                          {m.place_review_category()}
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
                          {m.place_review_operating_status()}
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
                <summary class="cursor-pointer">{m.place_review_effective()}</summary>
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
                    ? m.place_review_accepted()
                    : m.place_review_rejected()}
                </p>
                <p class="text-sm text-muted-foreground">{decision.reason}</p>
              {:else}
                {#if blocked(fieldGroup)}
                  <p class="text-sm">{m.place_review_dependencies()}</p>
                {/if}
                <div class="flex gap-2">
                  <Button
                    type="button"
                    text={m.place_review_accept()}
                    disabled={busy ||
                      isDirty ||
                      !associationRevision ||
                      !reason.trim() ||
                      blocked(fieldGroup)}
                    onClick={() => void decide(fieldGroup, 'accept')}
                  />
                  <Button
                    type="button"
                    text={m.place_review_reject()}
                    disabled={busy || isDirty || !associationRevision || !reason.trim()}
                    onClick={() => void decide(fieldGroup, 'reject')}
                  />
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <p>{m.place_review_refresh_evidence()}</p>
        {/if}
      </div>
    {/if}
    {#if failure}
      <p class="text-sm text-error" role="alert">{failure}</p>
    {/if}
  </div>
</section>
