<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button, Select } from '#lib/bits/core/index.js'
import { TextInput } from '#lib/bits/custom/form/index.js'
// API
import { decideFeaturePlacement } from '#lib/api/locationReview.remote.js'
// COMPONENTS
import AddressBlocks from '../formFeatureAddress/AddressBlocks.svelte'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import RejectIcon from 'virtual:icons/proicons/cancel-circle'
import ClockIcon from 'virtual:icons/lucide/clock'
import type { LocationReviewActions } from '#lib/locations/reviewPresentation.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
// DOMAIN
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { PlacementEvidence, PlacementDecision } from '#lib/locations/placement.js'

let {
  featureId,
  proposalId,
  placement,
  associationRevision,
  modifiedAt,
  isDirty,
  decided = false,
  onCommitted,
  onActionsChange,
  beforeAddress,
}: {
  featureId: string
  proposalId: string
  placement: PlacementEvidence
  associationRevision: string
  modifiedAt: string
  isDirty: boolean
  decided?: boolean
  onActionsChange?: LocationReviewActions
  beforeAddress?: FeatureAddress
  onCommitted: () => Promise<void>
} = $props()
let reason = $state(''),
  busy = $state(false),
  failure = $state('')
let addressChoice = $state<'accept' | 'keep'>('accept')
let directions = $state<'keep' | 'clear' | 'replace'>('keep')
let hints = $state<Record<string, string | null>>(
  untrack(() => ({ ...placement.beforeAccessHints })),
)
let directionsConfirmed = $state(false)
let pinChoice = $state('')
let longitude = $state(''),
  latitude = $state('')
let unitDetails = $state<'keep' | 'clear' | ''>('')
const customGeometry = $derived(
  pinChoice === 'custom' &&
    longitude.trim() &&
    latitude.trim() &&
    Number.isFinite(Number(longitude)) &&
    Number.isFinite(Number(latitude))
    ? {
        type: 'Point' as const,
        coordinates: [Number(longitude), Number(latitude)] as [number, number],
      }
    : undefined,
)
const locales = $derived([
  ...new Set(['en', 'zh-hant', 'zh-hans', ...Object.keys(placement.beforeAccessHints)]),
])
const destination = $derived(
  placement.content
    ? getAddressDisplay(
        {
          ...emptyFeatureAddress(),
          canonical: {
            addressId: placement.addressRevisionId!,
            revisionId: placement.addressRevisionId!,
            content: placement.content,
          },
        },
        'en',
      )
    : m.placement_review_missing_address(),
)
const proposedAddress = $derived({
  ...emptyFeatureAddress(),
  coordinates: placement.geometry?.coordinates ?? null,
  ...(placement.content
    ? {
        canonical: {
          addressId: placement.addressRevisionId ?? '',
          revisionId: placement.addressRevisionId ?? '',
          content: placement.content,
        },
      }
    : {}),
})
const cannotMove = $derived(
  busy ||
    isDirty ||
    decided ||
    !reason.trim() ||
    (placement.kind === 'relocation' &&
      (!pinChoice ||
        (pinChoice === 'custom' && !customGeometry) ||
        (Boolean(placement.beforeUnitDetails) && !unitDetails))),
)
$effect(() => {
  onActionsChange?.([
    {
      text: m.placement_review_later(),
      icon: ClockIcon,
      color: 'neutral',
      style: 'ghost',
      disabled: busy || isDirty || decided || !reason.trim(),
      onClick: () => void decide('later'),
    },
    {
      text: m.placement_review_keep(),
      icon: RejectIcon,
      color: 'error',
      style: 'ghost',
      disabled: busy || isDirty || decided || !reason.trim(),
      onClick: () => void decide('keep'),
    },
    {
      text:
        placement.kind === 'relocation'
          ? m.placement_review_move()
          : m.placement_review_use_address(),
      icon: CheckIcon,
      color: 'success',
      style: 'ghost',
      disabled: cannotMove,
      onClick: () => void decide('move'),
    },
  ])
})
/** Submit an explicit placement decision with all editor fences.
 * @param action Move, keep current placement, or leave this review pending. @returns Completion after commit refresh.
 */
async function decide(action: PlacementDecision['action']): Promise<void> {
  if (busy || isDirty || !reason.trim()) return
  busy = true
  failure = ''
  try {
    const result = await decideFeaturePlacement({
      featureId,
      proposalId,
      expectedRevision: associationRevision,
      expectedFeatureModifiedAt: modifiedAt,
      reason,
      decision: {
        action,
        addressChoice,
        useDestinationPin: pinChoice === 'source',
        ...(customGeometry ? { geometry: customGeometry } : {}),
        ...(unitDetails ? { unitDetails } : {}),
        ...(directionsConfirmed ? { directions, accessHints: hints } : {}),
      },
    })
    if (result.status === 'review') {
      failure = result.reason
      return
    }
    await onCommitted()
  } catch {
    failure = m.location_review_conflict()
  } finally {
    busy = false
  }
}
</script>
<section class="border-border space-y-4 rounded-xl border p-4">
  <h3 class="font-semibold">
    {placement.kind === 'relocation'
      ? m.placement_review_move_title()
      : m.placement_review_address_title()}
  </h3>
  {#if placement.beforeAddressDisplay}
    <p class="text-sm">
      <span class="font-medium">{m.location_review_before()}:</span>
      {placement.beforeAddressDisplay}
    </p>
  {/if}
  <p class="text-sm">
    <span class="font-medium">{m.placement_review_destination()}:</span>
    {destination || placement.addressRevisionId}
  </p>
  {#if placement.occupancyVerifiedAt}
    <p class="text-muted-foreground text-sm">
      {m.placement_review_verified()}: {placement.occupancyVerifiedAt}
    </p>
  {/if}
  {#each placement.occupancyEvidence ?? [] as evidence}
    <blockquote class="border-border border-l-2 pl-3 text-sm">
      {evidence.quotedText ?? evidence.description}
      {#if evidence.source.kind === 'url'}
        <a
          class="ml-2 underline"
          href={evidence.source.url}
          target="_blank"
          rel="noopener noreferrer"
          >{m.placement_review_evidence()}</a
        >
      {/if}
    </blockquote>
  {/each}
  <AddressBlocks before={beforeAddress} address={proposedAddress} />
  {#if placement.blockers.length}
    <p class="text-muted-foreground text-sm">
      {m.placement_review_checks()} {m.placement_review_blockers()}
    </p>
  {/if}
  {#if placement.kind === 'relocation'}
    <Select
      placeholder={m.placement_review_pin()}
      value={pinChoice}
      items={[
        ...(placement.geometry
          ? [{ value: 'source', label: m.placement_review_pin_source() }]
          : []),
        { value: 'custom', label: m.placement_review_pin_custom() },
      ]}
      onValueChange={v => (pinChoice = v)}
      disabled={busy || decided}
    />
    {#if pinChoice === 'custom'}
      <TextInput
        id="placement-longitude"
        name=""
        label={m.placement_review_longitude()}
        value={longitude}
        isEditing={!busy && !decided}
        onValueChange={v => (longitude = v)}
      />
      <TextInput
        id="placement-latitude"
        name=""
        label={m.placement_review_latitude()}
        value={latitude}
        isEditing={!busy && !decided}
        onValueChange={v => (latitude = v)}
      />
    {/if}
    {#if placement.beforeUnitDetails}
      <Select
        placeholder={m.placement_review_unit()}
        value={unitDetails}
        items={[
          { value: 'keep', label: m.placement_review_unit_keep() },
          { value: 'clear', label: m.placement_review_unit_clear() },
        ]}
        onValueChange={v => (unitDetails = v as typeof unitDetails)}
        disabled={busy || decided}
      />
    {/if}
  {/if}
  {#if Object.keys(placement.beforeOverrides).length}
    <Select
      placeholder={m.placement_review_address_choice()}
      value={addressChoice}
      items={[
        { value: 'accept', label: m.placement_review_use_address() },
        { value: 'keep', label: m.placement_review_keep_address() },
      ]}
      onValueChange={v => (addressChoice = v as typeof addressChoice)}
      disabled={busy || decided}
    />
  {/if}
  {#if Object.values(placement.beforeAccessHints).some(Boolean) ||
    placement.kind === 'relocation'}
    <Select
      placeholder={m.placement_review_directions()}
      value={directionsConfirmed ? directions : ''}
      items={[
        { value: 'keep', label: m.placement_review_keep_directions() },
        { value: 'clear', label: m.placement_review_clear_directions() },
        { value: 'replace', label: m.placement_review_replace_directions() },
      ]}
      onValueChange={v => {
        directions = v as typeof directions
        directionsConfirmed = true
      }}
      disabled={busy || decided}
    />
    {#each locales as locale}
      {#if directions === 'replace'}
        <TextInput
          id={`placement-directions-${locale}`}
          name=""
          label={locale}
          value={hints[locale] ?? ''}
          isEditing={!busy && !decided}
          onValueChange={value => (hints = { ...hints, [locale]: value })}
        />
      {:else if placement.beforeAccessHints[locale]}
        <p class="text-sm">
          <span class="font-medium">{locale}:</span>
          {placement.beforeAccessHints[locale]}
        </p>
      {/if}
    {/each}
  {/if}
  {#if !decided}
    <p class="text-muted-foreground text-sm">{m.location_review_reason_help()}</p>
    <TextInput
      id="placement-review-reason"
      name=""
      label={m.location_review_reason()}
      value={reason}
      isEditing={!busy}
      onValueChange={value => (reason = value)}
    />
    {#if !onActionsChange}
      <div class="flex flex-wrap gap-2">
        <Button
          text={placement.kind === 'relocation'
            ? m.placement_review_move()
            : m.placement_review_use_address()}
          disabled={busy ||
            isDirty ||
            !reason.trim() ||
            (placement.kind === 'relocation' &&
              (!pinChoice ||
                (pinChoice === 'custom' && !customGeometry) ||
                (Boolean(placement.beforeUnitDetails) && !unitDetails)))}
          onClick={() => decide('move')}
        />
        <Button
          text={m.placement_review_keep()}
          disabled={busy || isDirty || !reason.trim()}
          onClick={() => decide('keep')}
        />
        <Button
          text={m.placement_review_later()}
          disabled={busy || isDirty || !reason.trim()}
          onClick={() => decide('later')}
        />
      </div>
    {/if}
  {/if}
  {#if failure}
    <p role="alert" class="text-error text-sm">{failure}</p>
  {/if}
</section>
