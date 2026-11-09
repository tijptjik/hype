<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  getLocationCorrectionWorkspace,
  submitLocationCorrection,
  reviewLocationCorrection,
  setOrganisationLocationFollowPolicy,
} from '#lib/api/locationCorrections.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import SharedLocationContacts from './SharedLocationContacts.svelte'
import LocationBrandEditor from '#lib/bits/patterns/forms/featureLocation/LocationBrandEditor.svelte'
// TYPES
import type { LocationCorrectionPatch } from '#lib/locations/correctionProposal.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'

let {
  featureId,
  disabled = false,
  proposalId,
  onCommitted,
}: {
  featureId: string
  disabled?: boolean
  proposalId?: string
  onCommitted?: () => Promise<void>
} = $props()
type Workspace = NonNullable<Awaited<ReturnType<typeof getLocationCorrectionWorkspace>>>
let workspace = $state<Workspace | null>(null)
let names = $state<Record<string, string>>({})
let nameModes = $state<Record<string, 'keep' | 'override' | 'inherit'>>({})
let phoneMode = $state<'keep' | 'override' | 'inherit' | 'clear'>('keep')
let phones = $state('')
let brandEdit = $state<LocationBrandEdit | undefined>()
let reason = $state('')
let selectedFields = $state<Record<string, Array<keyof LocationCorrectionPatch>>>({})
let reviewReasons = $state<Record<string, string>>({})
let message = $state('')
let busy = $state(false)
let sequence = 0
const unavailable = $derived(disabled || busy)
const locales = $derived([
  ...new Set([
    'en',
    'zh-hant',
    'zh-hans',
    ...Object.keys(workspace?.current.names ?? {}),
  ]),
])

/** Load current shared values with a Feature-switch fence. */
async function load(): Promise<void> {
  const id = featureId,
    token = ++sequence
  const result = await refreshRemoteQuery(
    getLocationCorrectionWorkspace({ featureId: id, meta: { isAdminRequest: true } }),
  )
  if (featureId !== id || token !== sequence) return
  workspace = result
  names = Object.fromEntries(
    Object.entries(result?.current.names ?? {}).map(([locale, value]) => [
      locale,
      value ?? '',
    ]),
  )
  phones = result?.current.phoneNumber.join('\n') ?? ''
  nameModes = {}
  phoneMode = 'keep'
  brandEdit = undefined
}

/** Keep shared review failures visible and block duplicate commands. */
async function run(action: () => Promise<void>): Promise<void> {
  if (unavailable) return
  const requestedId = featureId
  busy = true
  message = ''
  try {
    await action()
  } catch (cause) {
    if (featureId === requestedId)
      message =
        cause instanceof Error ? cause.message : 'Could not save Location correction'
  } finally {
    busy = false
  }
}

/** Save authorized shared edits immediately, or propose changes requiring Organisation authority. */
async function submit(): Promise<void> {
  if (!workspace) return
  const requestedId = featureId
  const patch: LocationCorrectionPatch = {}
  for (const locale of locales) {
    const mode = nameModes[locale]
    if (mode === 'override' || mode === 'inherit') {
      patch.names ??= {}
      patch.names[locale] =
        mode === 'inherit' ? { mode } : { mode, value: names[locale] ?? '' }
    }
  }
  if (phoneMode !== 'keep')
    patch.phoneNumber =
      phoneMode === 'override'
        ? {
            mode: phoneMode,
            value: phones
              .split('\n')
              .map(value => value.trim())
              .filter(Boolean),
          }
        : { mode: phoneMode }
  if (brandEdit) patch.brands = brandEdit.choice
  const result = await submitLocationCorrection({
    featureId,
    meta: { isAdminRequest: true },
    patch,
    reason,
    expectedAssociationVersion: workspace.version,
    expectedOrganisationRevision: workspace.organisationRevision,
  })
  if (featureId !== requestedId) return
  await load()
  reason = ''
  message =
    result.status === 'accepted'
      ? 'Shared correction saved. Linked Features adopt it through their Location policy.'
      : 'Correction submitted for separate Organisation review.'
}

/** Record a separate shared decision; the existing adoption workflow handles Features afterward. */
async function decide(
  proposalId: string,
  outcome: 'accepted' | 'rejected',
): Promise<void> {
  const requestedId = featureId
  await reviewLocationCorrection({
    featureId,
    proposalId,
    outcome,
    ...(outcome === 'accepted' ? { selectedFields: mergeFields(proposalId) } : {}),
    reason: reviewReasons[proposalId] ?? '',
    meta: { isAdminRequest: true },
  })
  if (featureId !== requestedId) return
  await load()
  message =
    outcome === 'accepted'
      ? 'Shared correction accepted. Linked Features adopt it through their Location policy or review.'
      : 'Shared correction rejected.'
}

/** Return explicit field choices, defaulting to fields this reviewer can authorize.
 * @param id Proposal identity. @returns Fields to accept; all other proposed fields stay unchanged.
 */
function mergeFields(id: string): Array<keyof LocationCorrectionPatch> {
  return (
    selectedFields[id] ??
    (Object.keys(workspace?.proposals.find(row => row.id === id)?.patch ?? {}).filter(
      canMergeField,
    ) as Array<keyof LocationCorrectionPatch>)
  )
}
/** Match UI choices to server-enforced destination authority. @param field Proposed field. @returns Whether selectable. */
function canMergeField(field: string): boolean {
  return ['phoneNumber', 'websites', 'socials', 'accessibility'].includes(field)
    ? Boolean(workspace?.canEditSharedContacts)
    : Boolean(workspace?.canEditOrganisation)
}
/** Format safe retained values for the reviewer without exposing raw storage fields. */
function describeValues(
  values: Pick<Workspace['current'], 'names' | 'phoneNumber' | 'brands'> &
    Partial<Workspace['current']>,
): string {
  const names = Object.entries(values.names)
    .map(([locale, value]) => `${locale}: ${value ?? '(cleared)'}`)
    .join(' · ')
  const brands = values.brands
    .map(brand => Object.values(brand.names).join(' / '))
    .join(', ')
  return [
    names,
    `Phones: ${values.phoneNumber.join(', ') || '(none)'}`,
    `Brands: ${brands || '(none)'}`,
    `Websites: ${(values.websites ?? []).join(', ') || '(none)'}`,
    `Social profiles: ${JSON.stringify(values.socials ?? {})}`,
    `Accessibility: ${JSON.stringify(values.accessibility ?? null)}`,
    `Address and position: ${JSON.stringify(values.location)}`,
  ].join('\n')
}

$effect(() => {
  const requestedId = featureId
  untrack(() => {
    workspace = null
    message = ''
    reason = ''
    reviewReasons = {}
    void load().catch(cause => {
      if (featureId === requestedId)
        message =
          cause instanceof Error ? cause.message : 'Could not load Location corrections'
    })
  })
})
/** Save explicit Organisation freshness policy against current underlying evidence. */
async function followPolicy(
  field:
    | 'phoneNumber'
    | 'websites'
    | 'socials'
    | 'accessibility'
    | 'names'
    | 'brands'
    | 'location',
  mode: 'retain' | 'follow',
): Promise<void> {
  if (!workspace) return
  await run(async () => {
    await setOrganisationLocationFollowPolicy({
      featureId,
      field,
      mode,
      expectedOrganisationRevision: workspace!.organisationRevision,
    })
    await load()
  })
}
</script>
{#if !proposalId}
  <SharedLocationContacts {featureId} {disabled} />
{/if}

{#if !workspace && message}
  <p role="status" class="text-sm">{message}</p>
{/if}
{#if workspace}
  <section
    class="border-border space-y-4 rounded-lg border p-4"
    aria-label="Shared Location corrections"
  >
    <h3 class="font-semibold">Shared Location corrections</h3>
    <p class="text-muted-foreground text-sm">
      Names, phone numbers and brands may affect other Features in this Organisation.
      {workspace.canReview
        ? 'Save shared changes here.'
        : 'Changes require Organisation review.'}
    </p>
    {#if message}
      <p role="status" class="text-sm break-words whitespace-normal">{message}</p>
    {/if}
    <details>
      <summary class="cursor-pointer text-sm font-medium">
        {workspace.canReview
          ? 'Edit shared values or reset'
          : 'Propose a correction or reset'}
      </summary>
      <div class="grid gap-3 py-3">
        {#each locales as locale}
          <label class="grid gap-1 text-sm"
            >Name ({locale})
            <select
              class="border-border bg-background rounded-md border p-2"
              value={nameModes[locale] ?? 'keep'}
              disabled={unavailable}
              onchange={event =>
                (nameModes[locale] = event.currentTarget.value as
                  | 'keep'
                  | 'override'
                  | 'inherit')}
            >
              <option value="keep">Keep current</option>
              <option value="override">Correct name</option>
              <option value="inherit">Reset to inherited name</option>
            </select>
            {#if nameModes[locale] === 'override'}
              <input
                class="border-border bg-background rounded-md border p-2"
                bind:value={names[locale]}
                disabled={unavailable}
              >
            {/if}
          </label>
        {/each}
        {#if workspace.canEditFacts}
          <label class="grid gap-1 text-sm"
            >Phone numbers
            <select
              class="border-border bg-background rounded-md border p-2"
              bind:value={phoneMode}
              disabled={unavailable}
            >
              <option value="keep">Keep current</option>
              <option value="override">Correct phone numbers</option>
              <option value="inherit">Reset to inherited numbers</option>
              <option value="clear">Clear phone numbers</option>
            </select>
            {#if phoneMode === 'override'}
              <textarea
                class="border-border bg-background rounded-md border p-2"
                rows="3"
                bind:value={phones}
                disabled={unavailable}
                placeholder="One phone number per line"
              ></textarea>
            {/if}
          </label>
          <LocationBrandEditor
            association={{
              version: workspace.version,
              brandMode: 'override',
              effective: { brands: workspace.current.brands },
            }}
            edit={brandEdit}
            isEditing={!unavailable}
            onChange={edit => (brandEdit = edit)}
          />
        {/if}
        <label class="grid gap-1 text-sm"
          >Reason for the correction<textarea
            class="border-border bg-background rounded-md border p-2"
            bind:value={reason}
            disabled={unavailable}
            rows="2"
          ></textarea></label
        >
        <button
          type="button"
          class="border-border rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={unavailable || !reason.trim()}
          onclick={() => run(submit)}
        >
          {workspace.canReview ? 'Save shared correction' : 'Submit shared correction'}
        </button>
      </div>
    </details>
    {#each workspace.proposals.filter(
      row => !proposalId || row.id === proposalId,
    ) as proposal (proposal.id)}
      <article class="border-border grid gap-3 rounded-md border p-3 text-sm">
        <p>
          {proposal.outcome ?? 'Awaiting staff review'}
          · {proposal.actorId} · {proposal.reason}
        </p>
        {#if proposal.acceptedFields}
          <p>Accepted fields: {proposal.acceptedFields.join(', ')}</p>
        {/if}
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <p class="font-medium">Before</p>
            <p class="break-words whitespace-pre-wrap">
              {describeValues(proposal.before)}
            </p>
          </div>
          <div>
            <p class="font-medium">Proposed</p>
            <p class="break-words whitespace-pre-wrap">
              {describeValues(proposal.after)}
            </p>
          </div>
        </div>
        {#if workspace.canReview && !proposal.outcome}
          <fieldset class="space-y-2">
            <legend class="font-medium">Choose changes to accept</legend>
            {#each Object.keys(proposal.patch) as field}
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mergeFields(proposal.id).includes(
                    field as keyof LocationCorrectionPatch,
                  )}
                  disabled={unavailable || !canMergeField(field)}
                  onchange={event => {
                    selectedFields[proposal.id] = event.currentTarget.checked
                      ? [
                          ...mergeFields(proposal.id),
                          field as keyof LocationCorrectionPatch,
                        ]
                      : mergeFields(proposal.id).filter(value => value !== field)
                  }}
                >
                <span
                  >{field === 'phoneNumber'
                    ? 'Phone numbers'
                    : field === 'location'
                      ? 'Address and position'
                      : field}
                  ·
                  {['phoneNumber', 'websites', 'socials', 'accessibility'].includes(
                    field,
                  )
                    ? 'Hype shared correction'
                    : 'Organisation override'}</span
                >
              </label>
            {/each}
            <p class="text-muted-foreground">
              Unchecked changes will not be applied. This completes the proposal review.
            </p>
          </fieldset>
          <label class="grid gap-1"
            >Review reason<input
              class="border-border bg-background rounded-md border p-2"
              bind:value={reviewReasons[proposal.id]}
              disabled={unavailable}
            ></label
          >
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="border-border rounded-md border px-3 py-2 disabled:opacity-50"
              disabled={unavailable ||
                !reviewReasons[proposal.id]?.trim() ||
                !mergeFields(proposal.id).length}
              onclick={() => run(() => decide(proposal.id, 'accepted'))}
            >
              Accept selected changes
            </button>
            <button
              type="button"
              class="border-border rounded-md border px-3 py-2 disabled:opacity-50"
              disabled={unavailable || !reviewReasons[proposal.id]?.trim()}
              onclick={() => run(() => decide(proposal.id, 'rejected'))}
            >
              Reject
            </button>
          </div>
        {:else if proposal.reviewerId}
          <p class="text-muted-foreground">Reviewed by {proposal.reviewerId}</p>
        {/if}
      </article>
    {/each}
  </section>
{/if}

{#if workspace?.canEditOrganisation && !proposalId}
  <section class="border-border space-y-2 border-t pt-4">
    <h3 class="font-semibold">Organisation update policy</h3>
    <p class="text-muted-foreground text-sm">
      Keep your corrections, or accept changed underlying values. Repeated syncs of
      unchanged data do not replace corrections.
    </p>
    {#each [
      'phoneNumber',
      'websites',
      'socials',
      'accessibility',
      'names',
      'brands',
      'location',
    ] as field}
      <label class="flex items-center justify-between gap-3 text-sm">
        {field === 'phoneNumber'
          ? 'Phone numbers'
          : field === 'location'
            ? 'Address and position'
            : field}
        <select
          class="border-border rounded border p-2"
          disabled={unavailable}
          value={workspace.freshness[field]?.mode ?? 'retain'}
          onchange={event =>
            followPolicy(
              field as Parameters<typeof followPolicy>[0],
              event.currentTarget.value as 'retain' | 'follow',
            )}
        >
          <option value="retain">Keep Organisation correction</option>
          <option value="follow">Accept changed underlying value</option>
        </select>
      </label>
    {/each}
  </section>
{/if}
