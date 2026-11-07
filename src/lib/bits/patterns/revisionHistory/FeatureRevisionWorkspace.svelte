<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  getFeatureRevisionWorkspace,
  getFeatureFormRevisionReview,
  getFeaturePublicationReview,
  getFeaturePrivateReview,
  publishFeatureFormRevision,
  saveFeatureTranslationDraft,
  submitFeatureTranslationDraft,
  publishFeatureTranslationRevision,
  decideFeatureTranslationRevision,
} from '#lib/api/featureRevisions.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import FeaturePublicationHistory from './FeaturePublicationHistory.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Header from '#lib/bits/custom/header/Header.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// ICONS
import HistoryIcon from 'virtual:icons/proicons/history'
// DOMAIN
import { featureReviewLabel, featureReviewValue } from '#lib/revisions/featureReviewDisplay.js'
// TYPES
import type { FeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import type { RevisionConflict, RevisionResolution } from '#lib/revisions/merge.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

let {
  featureId,
  reviewMode = false,
  taskId,
  isDirty = false,
  refreshVersion = 0,
  onPublished,
}: {
  featureId: string
  reviewMode?: boolean
  taskId?: string
  isDirty?: boolean
  refreshVersion?: number
  onPublished: () => Promise<void>
} = $props()
type Workspace = FeatureRevisionWorkspace & {
  canPublish: boolean
  fields: ('title' | 'description')[]
}
let workspace = $state<Workspace | null>(null)
let busy = $state(false)
let message = $state('')
let locale = $state('')
let title = $state('')
let description = $state('')
let editing = $state<FeatureRevisionWorkspace['proposals'][number] | null>(null)
let rejectionReasons = $state<Record<string, string>>({})
let formReviews = $state<Record<string, { candidateRevisionId: string; changes: RevisionDifference[];
  images: { imageId: string; before: string | null; after: string | null }[] }>>({})
let loadedFor = ''
let conflicts = $state<RevisionConflict[]>([])
let conflictProposal = $state<string | null>(null)
let choices = $state<Record<string, 'current' | 'proposed'>>({})
const disabled = $derived(busy || isDirty)
let loadSequence = 0

/** Refresh only this Feature's bounded, authorized workspace. */
async function load(): Promise<void> {
  const requestedId = featureId
  const sequence = ++loadSequence
  const result = await refreshRemoteQuery(getFeatureRevisionWorkspace({ featureId: requestedId, taskId, meta: { isAdminRequest: true } }))
  if (featureId !== requestedId || sequence !== loadSequence) return
  workspace = result
  if (!locale || !workspace.translations[locale])
    locale = Object.keys(workspace.translations)[0] ?? ''
}

/** Show an owned draft or the current published text without mutating either. */
function selectDraft(
  proposal: FeatureRevisionWorkspace['proposals'][number] | null,
): void {
  editing = proposal
  const values = proposal?.after ?? workspace?.translations
  const row = values?.[locale]
  title = row?.title ?? ''
  description = row?.description ?? ''
}

/** Keep failures in this panel and prevent duplicate commands while one is pending. */
async function run(action: () => Promise<void>): Promise<void> {
  if (disabled) return
  busy = true
  message = ''
  try {
    await action()
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Unable to complete this change.'
  } finally {
    busy = false
  }
}

/** Save only changed text so an untouched inherited name is not submitted as a correction. */
async function save(): Promise<void> {
  if (!workspace?.comparisonRevisionId || !locale) return
  const before = (editing?.after ?? workspace.translations)[locale]
  const patch: { title?: string; description?: string } = {}
  if (title !== before?.title) patch.title = title
  if (
    workspace.fields.includes('description') &&
    description !== (before?.description ?? '')
  )
    patch.description = description
  if (!Object.keys(patch).length) {
    message = 'No translation changes to save.'
    return
  }
  const saved = await saveFeatureTranslationDraft({
    featureId,
    meta: { isAdminRequest: true },
    baseRevisionId: editing?.baseRevisionId ?? workspace.comparisonRevisionId,
    ...(editing
      ? {
          draft: {
            proposalId: editing.id,
            candidateRevisionId: editing.candidateRevisionId,
          },
        }
      : {}),
    patch: { translations: { [locale]: patch } },
  })
  await load()
  selectDraft(
    workspace.proposals.find(proposal => proposal.id === saved.proposalId) ?? null,
  )
  message = 'Draft saved. Published content has not changed.'
}

/** Publish the exact inspected draft/proposal and retain conflict choices against that head. */
async function publish(
  proposal: FeatureRevisionWorkspace['proposals'][number],
): Promise<void> {
  if (!workspace?.comparisonRevisionId) return
  const resolutions: RevisionResolution[] | undefined = conflictProposal === proposal.id
    ? conflicts.map(conflict => {
        const choice = choices[JSON.stringify(conflict.path)]
        if (!choice) throw new Error('Choose a value for every conflict.')
        return { path: conflict.path, result: conflict[choice] }
      }) : undefined
  const input = {
    featureId,
    meta: { isAdminRequest: true },
    proposalId: proposal.id,
    expectedCandidateRevisionId: proposal.candidateRevisionId,
    expectedPublishedRevisionId: workspace.publishedRevisionId,
    expectedComparisonRevisionId: workspace.comparisonRevisionId,
    expectedGeneration: workspace.generation,
  }
  if (!proposal.translationOnly && formReviews[proposal.id]?.candidateRevisionId !== proposal.candidateRevisionId)
    throw new Error('Review this saved draft before publishing.')
  const result = proposal.translationOnly
    ? await publishFeatureTranslationRevision({ ...input, ownDraft: proposal.status === 'draft',
        resolutions: resolutions?.map(resolution => {
          if (!resolution.result.present) throw new Error('Translation removal is not supported')
          return { path: resolution.path, result: { present: true as const,
            value: resolution.result.value as { value: string | null; generated: boolean } } }
        }),
      })
    : await publishFeatureFormRevision({ ...input, ownDraft: proposal.status === 'draft', resolutions })
  if (result.status === 'conflict') {
    conflicts = result.conflicts
    conflictProposal = proposal.id
    choices = {}
    message = 'Choose which value to publish for each conflict.'
    return
  }
  if (result.status === 'invalid') {
    message = result.errors.join('; ')
    return
  }
  conflicts = []
  conflictProposal = null
  if (result.status === 'stale') {
    await load()
    message = 'The Feature changed. Review the refreshed version before publishing.'
    return
  }
  editing = null
  await load()
  selectDraft(null)
  await onPublished()
  message = 'Published. Other proposals remain in the review queue.'
}

/** Display only the text portion of an authorized atomic translation conflict. */
function conflictText(
  conflict: RevisionConflict,
  choice: 'current' | 'proposed',
): string {
  return featureReviewValue({ path: [...conflict.path], before: conflict.current, after: conflict.proposed },
    choice === 'current' ? 'before' : 'after')
}

// Read-only hydration must still run while a successful form save is settling its dirty state.
$effect(() => {
  const requestedId = featureId
  refreshVersion
  untrack(() => {
    if (loadedFor !== requestedId) {
      loadedFor = requestedId
      workspace = null
      formReviews = {}
      conflicts = []
      conflictProposal = null
      editing = null
      message = ''
    }
    void load().then(() => {
      if (featureId === requestedId) selectDraft(null)
    }).catch(cause => {
      if (featureId === requestedId) message = cause instanceof Error ? cause.message : 'Could not load Feature revisions'
    })
  })
})
</script>

<section
  class="w-full min-w-0 space-y-4 pb-12"
  aria-label="Feature revisions"
>
  <FormSurface class="mb-0!">
    <SectionHeader>
      {#snippet left()}
        <Header text={reviewMode ? 'Review proposed changes' : 'History'} description="Changes to this feature · newest first" icon={HistoryIcon} size="sm" class="bits-form__section-header-heading w-auto! min-w-0" />
      {/snippet}
      {#snippet right()}
        <button type="button" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" {disabled} onclick={() => run(load)}>Refresh</button>
      {/snippet}
    </SectionHeader>
  </FormSurface>
  {#if message}
    <p role="status" class="whitespace-normal break-words text-sm">{message}</p>
  {/if}
  {#if isDirty}
    <p class="text-sm text-muted-foreground">
      Save or discard the open form changes before using revision actions.
    </p>
  {/if}
  {#if workspace && !workspace.enabled}
    <p class="text-sm text-muted-foreground">
      Revision recording is not enabled for this Feature yet.
    </p>
  {:else if workspace?.enabled}
    {#if workspace.state !== 'active'}
      <p class="text-sm text-muted-foreground">
        This Feature was {workspace.state === 'merged' ? 'merged into another Feature' : 'split into successor Features'}.
        Its earlier publications remain available below.
      </p>
    {:else if workspace.initialContribution}
      <p class="text-sm text-muted-foreground">This new Feature and its photos are reviewed together in the task queue.</p>
      {#if workspace.initialTaskId}
        <a class="text-sm underline" href={`/admin/tasks/${encodeURIComponent(workspace.initialTaskId)}`}>Open contribution task</a>
      {/if}
    {/if}
    {#each workspace.proposals.filter(proposal => reviewMode && proposal.status === 'submitted') as proposal (proposal.id)}
      <article data-proposal-id={proposal.id} class="space-y-3 rounded-lg border border-border p-4">
        <p class="text-sm font-medium">
          {proposal.status}
          · {proposal.own ? 'Your proposal' : proposal.contributorId}
        </p>
        {#each Object.entries(proposal.after) as [language, row]}
          {#each ['title', 'description'] as field}
            {@const key = field as 'title' | 'description'}
            {#if row[key] !== proposal.before[language]?.[key]}
              <div class="grid min-w-0 gap-1 text-sm">
                <p class="font-medium">
                  {language}
                  · {key === 'title' ? 'Name' : 'Description'}
                </p>
                <p class="whitespace-pre-wrap break-words text-muted-foreground">
                  Before: {proposal.before[language]?.[key] ?? ''}
                </p>
                <p class="whitespace-pre-wrap break-words">
                  Proposed: {row[key] ?? ''}
                </p>
              </div>
            {/if}
          {/each}
        {/each}
        {#if !proposal.translationOnly}
          {#if workspace.canPublish && ((proposal.own && proposal.status === 'draft') || proposal.status === 'submitted')}
            <button type="button" class="rounded-md border border-border px-3 py-2 text-sm" {disabled}
              onclick={() => run(async () => {
                const review = await getFeatureFormRevisionReview({ featureId, meta: { isAdminRequest: true }, proposalId: proposal.id,
                  expectedCandidateRevisionId: proposal.candidateRevisionId })
                formReviews[proposal.id] = { ...review, candidateRevisionId: proposal.candidateRevisionId }
              })}>Review saved Feature changes</button>
          {/if}
          {#if formReviews[proposal.id]?.candidateRevisionId === proposal.candidateRevisionId}
            {#each formReviews[proposal.id].images as photo (photo.imageId)}
              <div class="grid min-w-0 grid-cols-2 gap-3">
                {#each [{ label: 'Before', id: photo.before }, { label: 'Proposed', id: photo.after }] as version}
                  <figure class="min-w-0">
                    <figcaption class="mb-1 text-sm text-muted-foreground">{version.label}</figcaption>
                    {#if version.id}
                      <img class="max-h-64 w-full rounded-md object-contain" alt={`${version.label} photo`}
                        src={`/api/images/revisions/${encodeURIComponent(version.id)}?feature=${encodeURIComponent(featureId)}&t=c_fit,w_512,h_512`} />
                    {:else}<p class="text-sm">{version.label === 'Before' ? 'New photo' : 'Removed'}</p>{/if}
                  </figure>
                {/each}
              </div>
            {/each}
            {#each formReviews[proposal.id].changes as change}
              <div class="grid min-w-0 gap-1 text-sm">
                <p class="font-medium break-words">{featureReviewLabel(change.path)}</p>
                <p class="whitespace-pre-wrap break-words text-muted-foreground">Before: {featureReviewValue(change, 'before')}</p>
                <p class="whitespace-pre-wrap break-words">Proposed: {featureReviewValue(change, 'after')}</p>
              </div>
            {/each}
          {/if}
        {/if}
        {#if conflictProposal === proposal.id}
          {#each conflicts as conflict}
            <label class="grid min-w-0 gap-2 text-sm"
              >{featureReviewLabel(conflict.path)}
              <span class="whitespace-pre-wrap break-words"
                >Current: {conflictText(conflict, 'current')}</span
              >
              <span class="whitespace-pre-wrap break-words"
                >Proposed: {conflictText(conflict, 'proposed')}</span
              >
              <select
                class="rounded-md border border-border bg-background p-2"
                bind:value={choices[JSON.stringify(conflict.path)]}
                {disabled}
              >
                <option value={undefined}>Choose a value</option>
                <option value="current">Keep current</option>
                <option value="proposed">Use proposed</option>
              </select>
            </label>
          {/each}
        {/if}
        {#if workspace.state === 'active' && !workspace.initialContribution}
        <div class="flex flex-wrap gap-2">
          {#if proposal.own && proposal.status === 'draft' && proposal.translationOnly}
            <button
              type="button"
              class="rounded-md border border-border px-3 py-2 text-sm"
              {disabled}
              onclick={() => selectDraft(proposal)}
            >
              Edit draft
            </button>
            <button
              type="button"
              class="rounded-md border border-border px-3 py-2 text-sm"
              {disabled}
              onclick={() =>
                run(async () => {
                  await submitFeatureTranslationDraft({
                    featureId,
    meta: { isAdminRequest: true },
                    proposalId: proposal.id,
                    expectedCandidateRevisionId: proposal.candidateRevisionId,
                  })
                  editing = null
                  await load()
                  selectDraft(null)
                })}
            >
              Submit for review
            </button>
          {/if}
          {#if workspace.canPublish && !workspace.initialContribution &&
            (proposal.translationOnly || formReviews[proposal.id]?.candidateRevisionId === proposal.candidateRevisionId) &&
            ((proposal.own && proposal.status === 'draft') ||
              (proposal.status === 'submitted' && workspace.publishedRevisionId))}
            <button
              type="button"
              class="rounded-md border border-border px-3 py-2 text-sm"
              {disabled}
              onclick={() => run(() => publish(proposal))}
            >
              {proposal.status === 'draft' ? 'Publish draft' : 'Accept and publish'}
            </button>
          {/if}
          {#if proposal.own && !workspace.initialContribution &&
            (proposal.status === 'draft' || proposal.status === 'submitted')}
            <button
              type="button"
              class="rounded-md border border-border px-3 py-2 text-sm"
              {disabled}
              onclick={() =>
                run(async () => {
                  await decideFeatureTranslationRevision({
                    featureId,
    meta: { isAdminRequest: true },
                    proposalId: proposal.id,
                    expectedCandidateRevisionId: proposal.candidateRevisionId,
                    action: 'withdraw',
                    reason: 'Withdrawn by author',
                  })
                  editing = null
                  await load()
                  selectDraft(null)
                })}
            >
              Withdraw
            </button>
          {/if}
        </div>
        {#if workspace.canPublish && proposal.status === 'submitted'}
          <label class="grid gap-1 text-sm"
            >Reason for rejection
            <input
              class="rounded-md border border-border bg-background p-2"
              bind:value={rejectionReasons[proposal.id]}
              {disabled}
            >
          </label>
          <button
            type="button"
            class="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
            disabled={disabled || !rejectionReasons[proposal.id]?.trim()}
            onclick={() =>
              run(async () => {
                await decideFeatureTranslationRevision({
                  featureId,
    meta: { isAdminRequest: true },
                  proposalId: proposal.id,
                  expectedCandidateRevisionId: proposal.candidateRevisionId,
                  action: 'reject',
                  reason: rejectionReasons[proposal.id],
                })
                await load()
              })}
          >
            Reject proposal
          </button>
        {/if}
        {/if}
      </article>
    {/each}
    {#key workspace}
      {#if workspace.privateHistory?.length}
        <FeaturePublicationHistory
          label="Changes recorded while unpublished"
          privateHistory
          entries={workspace.privateHistory.map((entry, index) => ({ ...entry, generation: -index - 1 }))}
          canReview={workspace.canPublish}
          loadReview={entry => getFeaturePrivateReview({ featureId, revisionId: entry.revisionId!, meta: { isAdminRequest: true } })}
        />
      {/if}
      <FeaturePublicationHistory
        entries={workspace.history}
        canReview={workspace.canPublish}
        loadReview={entry => getFeaturePublicationReview({ featureId, generation: entry.generation, meta: { isAdminRequest: true } })}
      />
    {/key}
  {/if}
</section>
