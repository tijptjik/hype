<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  inspectFeatureIdentity,
  proposeFeatureIdentity,
  listFeatureIdentityProposals,
  reviewFeatureIdentity,
  decideFeatureIdentity,
} from '#lib/api/featureIdentity.remote.js'
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import FeatureIdentityOutput from './FeatureIdentityOutput.svelte'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// PRESENTATION
import { getI18n } from '#lib/i18n.js'
import { getURLfromImage } from '#lib/client/services/image.js'
import { identityTitle, identityPhoto } from './featureIdentity.types'
// TYPES
import type {
  IdentitySource as Source,
  IdentityOutput as Output,
} from './featureIdentity.types'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

// TABLE OF CONTENTS
// 1. Source selection and search
// 2. Local output editing
// 3. Proposal review and publication
let {
  featureId,
  disabled = false,
  onPublished,
}: {
  featureId: string
  disabled?: boolean
  onPublished: () => Promise<void>
} = $props()
let kind = $state<'merge' | 'split'>('split'),
  otherIds = $state(''),
  reason = $state('')
let sources = $state<Source[]>([]),
  outputs = $state<Output[]>([]),
  keepOriginal = $state(true)
let queue = $state<Awaited<ReturnType<typeof listFeatureIdentityProposals>>>([])
let review = $state<Awaited<ReturnType<typeof reviewFeatureIdentity>> | null>(null)
let destinations = $state<Record<string, string>>({})
let retain = $state(false),
  decisionReason = $state(''),
  message = $state(''),
  busy = $state(false)
const blocked = $derived(disabled || busy)
const taskLabels: Record<string, string> = {
  newPhoto: 'Photo contribution',
  reportedMissing: 'Missing-place report',
  newFeature: 'Feature contribution',
}
const fieldClass =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50'
const primaryClass =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-content hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40'
const view = getSurfaceCtx()
let expanded = $state(false),
  search = $state(''),
  layerId = $state(''),
  searching = $state(false)
let matches = $state<Feature[]>([]),
  searchError = $state('')
let searchVersion = 0
const ready = $derived(outputs.length > 0 && (kind === 'split' || sources.length > 1))

/** Find candidates in the current layer under ordinary admin list permissions.
 * @param text Search phrase. @param version Request token. @param id Current route identity.
 * @returns Completion after only the latest results are displayed.
 */
async function searchCandidates(
  text: string,
  version: number,
  id: string,
): Promise<void> {
  searching = true
  searchError = ''
  try {
    const result = await refreshRemoteQuery(
      getFeatureIndexPage({
        q: text,
        prisms: { layer: [layerId] },
        conditions: { isPublished: true, isArchived: false },
        pagination: { limit: 12, offset: 0 },
        includeCount: false,
        meta: { ...view.resources.queryMeta, isAdminRequest: true, profile: 'admin' },
      }),
    )
    if (version === searchVersion && featureId === id)
      matches = result.data.filter(
        item => item.id !== id && !sources.some(source => source.featureId === item.id),
      ) as Feature[]
  } catch (cause) {
    if (version === searchVersion)
      searchError = cause instanceof Error ? cause.message : 'Search unavailable.'
  } finally {
    if (version === searchVersion) searching = false
  }
}
$effect(() => {
  const text = search.trim(),
    id = featureId,
    layer = layerId,
    operation = kind
  const version = ++searchVersion
  matches = []
  searchError = ''
  searching = false
  if (!text || !layer || operation !== 'merge') return
  const timer = setTimeout(() => {
    void searchCandidates(text, version, id)
  }, 250)
  return () => clearTimeout(timer)
})
/** Start a different operation with freshly inspected content.
 * @param next Requested operation. @returns Completion after rebuilding local results.
 */
async function changeKind(next: 'merge' | 'split'): Promise<void> {
  kind = next
  sources = []
  outputs = []
  otherIds = ''
  search = ''
  review = null
  reason = ''
  await inspect()
}
/** Select a merge candidate without publishing any data.
 * @param id Selected identity. @returns Completion after inspecting all selected sources.
 */
async function addCandidate(id: string): Promise<void> {
  const previousIds = otherIds
  otherIds = [...new Set([...otherIds.split(/\s+/).filter(Boolean), id])].join(' ')
  search = ''
  matches = []
  try {
    await inspect()
  } catch (cause) {
    otherIds = previousIds
    throw cause
  }
}
/** Remove a candidate and rebuild the local result from the remaining sources.
 * @param id Removed identity. @returns Completion after source inspection.
 */
async function removeCandidate(id: string): Promise<void> {
  otherIds = otherIds
    .split(/\s+/)
    .filter(value => value !== id)
    .join(' ')
  await inspect()
}

/** Reload this identity's queue without exposing unrelated proposal content. */
async function load(): Promise<void> {
  const requestedId = featureId
  const result = await refreshRemoteQuery(
    listFeatureIdentityProposals({
      featureId: requestedId,
      meta: { isAdminRequest: true },
    }),
  )
  if (featureId === requestedId) queue = result
}
/** Keep errors and in-flight controls within the identity workspace. */
async function run(action: () => Promise<void>): Promise<void> {
  if (blocked) return
  const requestedId = featureId
  busy = true
  message = ''
  try {
    await action()
  } catch (cause) {
    if (featureId === requestedId)
      message =
        cause instanceof Error ? cause.message : 'Unable to complete identity review.'
  } finally {
    busy = false
  }
}
/** Build explicit source choices; changing a mode requires another inspection. */
async function inspect(): Promise<void> {
  const requestedId = featureId
  const ids =
    kind === 'merge'
      ? [...new Set([featureId, ...otherIds.split(/[\s,]+/).filter(Boolean)])]
      : [featureId]
  const result = await refreshRemoteQuery(
    inspectFeatureIdentity({ featureIds: ids, meta: { isAdminRequest: true } }),
  )
  if (featureId !== requestedId) return
  sources = result
  const current = await view.getFeatureById(requestedId)
  if (featureId !== requestedId) return
  layerId = current?.layerId ?? ''
  outputs = Array.from({ length: kind === 'merge' ? 1 : 2 }, (_, index) =>
    makeOutput(
      sources[0],
      index === 0 && (kind === 'merge' || keepOriginal) ? featureId : null,
    ),
  )
  review = null
}
/** Copy selectable public evidence into a local editor, preserving exact image pins. */
function makeOutput(source: Source, id: string | null): Output {
  return {
    featureId: id,
    sourceFeatureId: source.featureId,
    titles: Object.fromEntries(
      Object.entries(source.content.translations).map(([locale, row]) => [
        locale,
        row.title.value,
      ]),
    ),
    images: source.content.gallery.order.map(imageId => ({
      sourceFeatureId: source.featureId,
      imageId,
    })),
    coverImageId:
      source.content.gallery.order.find(
        id => source.content.gallery.entries[id].intent === 'canonical',
      ) ?? source.content.gallery.order[0],
    properties: Object.keys(source.content.properties).map(propertyId => ({
      sourceFeatureId: source.featureId,
      propertyId,
    })),
  }
}
/** Choose a complete profile/Location/field source without silently combining dependent values. */
function selectSource(index: number, id: string): void {
  outputs[index] = makeOutput(
    sources.find(source => source.featureId === id)!,
    outputs[index].featureId,
  )
}
/** Include or exclude an exact inspected image in an output gallery. */
function selectImage(
  index: number,
  sourceFeatureId: string,
  imageId: string,
  checked: boolean,
): void {
  const output = outputs[index]
  output.images = output.images.filter(image => image.imageId !== imageId)
  if (checked) output.images.push({ sourceFeatureId, imageId })
  if (!output.images.some(image => image.imageId === output.coverImageId))
    output.coverImageId = output.images[0]?.imageId
}
/** Select one inspected value per field, or explicitly omit that field. */
function selectProperty(
  index: number,
  propertyId: string,
  sourceFeatureId: string,
): void {
  const output = outputs[index]
  output.properties = output.properties.filter(
    property => property.propertyId !== propertyId,
  )
  if (sourceFeatureId) output.properties.push({ sourceFeatureId, propertyId })
}
/** Reorder a selected image without changing its immutable evidence. */
function moveImage(index: number, imageIndex: number, offset: number): void {
  const images = [...outputs[index].images],
    target = imageIndex + offset
  if (target < 0 || target >= images.length) return
  ;[images[imageIndex], images[target]] = [images[target], images[imageIndex]]
  outputs[index].images = images
}
/** Save complete output choices for a separate explicit review action. */
async function propose(): Promise<void> {
  const requestedId = featureId
  const result = await proposeFeatureIdentity({
    kind,
    inputs: sources.map(({ featureId, revisionId, generation }) => ({
      featureId,
      revisionId,
      generation,
    })),
    outputs,
    reason,
    meta: { isAdminRequest: true },
  })
  if (featureId !== requestedId) return
  await load()
  if (featureId !== requestedId) return
  await openReview(result.proposalId)
  if (featureId !== requestedId) return
  message = 'Proposal saved. Published Features have not changed.'
}
/** Load all affected identities under current permissions before enabling acceptance. */
async function openReview(proposalId: string): Promise<void> {
  const requestedId = featureId
  const result = await refreshRemoteQuery(
    reviewFeatureIdentity({ proposalId, meta: { isAdminRequest: true } }),
  )
  if (featureId !== requestedId) return
  review = result
  destinations = Object.fromEntries(
    result.tasks.map(task => [
      task.id,
      result.taskAssignments.find(assignment => assignment.taskId === task.id)
        ?.featureId ??
        (result.kind === 'merge'
          ? result.records.find(record => record.role === 'output')!.featureId
          : ''),
    ]),
  )
  retain = false
  decisionReason = ''
}
/** Decide the inspected whole operation and refresh accepted Feature projections. */
async function decide(accept: boolean): Promise<void> {
  if (!review || (accept && !retain)) return
  const requestedId = featureId,
    proposalId = review.id
  await decideFeatureIdentity({
    proposalId,
    accept,
    reason: decisionReason,
    relationshipsReviewed: true,
    taskAssignments: accept
      ? review.tasks.map(task => ({
          taskId: task.id,
          featureId: destinations[task.id],
        }))
      : [],
    meta: { isAdminRequest: true },
  })
  if (featureId !== requestedId) return
  await openReview(proposalId)
  await load()
  if (featureId !== requestedId) return
  await onPublished()
  if (featureId !== requestedId) return
  message = accept
    ? 'All outputs published together. Original histories are retained.'
    : 'Proposal rejected. Published Features have not changed.'
}
$effect(() => {
  const id = featureId
  untrack(() => {
    sources = []
    outputs = []
    review = null
    queue = []
    message = ''
    otherIds = ''
    layerId = ''
    search = ''
    reason = ''
    expanded = false
    void load().catch(cause => {
      if (featureId === id) message = String(cause)
    })
  })
})
</script>

<details
  class="border-border bg-background overflow-hidden rounded-2xl border"
  aria-label="Feature merge and split"
  bind:open={expanded}
  ontoggle={event => {
    if (event.currentTarget.open && !sources.length && !busy) void run(inspect)
  }}
>
  <summary class="cursor-pointer px-5 py-4 text-base font-medium">
    Split or merge Features
  </summary>
  <div class="border-border grid gap-6 border-t p-4 sm:p-5">
    <fieldset class="grid grid-cols-2 gap-3" aria-label="Operation">
      {#each ['split', 'merge'] as operation}
        <button
          type="button"
          aria-pressed={kind === operation}
          disabled={blocked}
          class={`focus-visible:outline-primary rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 disabled:opacity-50 ${kind === operation ? 'border-primary/60 bg-primary/10' : 'border-border hover:bg-primary/5'}`}
          onclick={() => run(() => changeKind(operation as 'split' | 'merge'))}
        >
          <span class="text-primary mb-2 block text-2xl" aria-hidden="true"
            >{operation === 'split' ? '↗ ↘' : '↘ ↗'}</span
          >
          <span class="block text-sm font-semibold"
            >{operation === 'split' ? 'Two from One' : 'One from Many'}</span
          >
          <span class="text-muted-foreground mt-1 block text-xs leading-relaxed"
            >{operation === 'split'
              ? 'Split this Feature into separate results.'
              : 'Bring related Features together.'}</span
          >
        </button>
      {/each}
    </fieldset>

    <section class="grid gap-3" aria-label="Source Features">
      <div class="flex items-baseline gap-3">
        <span class="text-primary text-xs font-medium">01</span>
        <h3 class="text-sm font-semibold">
          {kind === 'split'
            ? 'Start with this Feature'
            : 'Choose the Features to merge'}
        </h3>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each sources as source}
          <div
            class="border-border grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-2"
          >
            {#if source.content.gallery.order[0]}
              <img
                class="h-14 w-14 rounded-lg object-cover"
                src={identityPhoto(source, source.content.gallery.order[0])}
                alt=""
              >
            {:else}
              <div class="bg-primary/10 h-14 w-14 rounded-lg"></div>
            {/if}
            <div class="min-w-0">
              <p class="text-sm font-medium break-words whitespace-normal">
                {identityTitle(source)}
              </p>
              <p class="text-muted-foreground mt-1 text-xs">
                {source.content.gallery.order.length}
                {source.content.gallery.order.length === 1 ? 'photo' : 'photos'}
                ·
                {source.featureId === featureId ? 'Current Feature' : 'Selected'}
              </p>
            </div>
            {#if source.featureId !== featureId}
              <button
                type="button"
                class={fieldClass}
                aria-label={`Remove ${identityTitle(source)}`}
                disabled={blocked}
                onclick={() => run(() => removeCandidate(source.featureId))}
              >
                ×
              </button>
            {/if}
          </div>
        {/each}
      </div>
      {#if !sources.length}
        {#if busy}
          <p role="status" class="text-muted-foreground text-sm">
            Loading source Feature…
          </p>
        {:else}
          <button
            type="button"
            class={`${fieldClass} justify-self-start`}
            disabled={blocked}
            onclick={() => run(inspect)}
          >
            Load source Feature
          </button>
        {/if}
      {/if}
      {#if kind === 'merge'}
        <label class="grid gap-2 text-sm"
          >Find another Feature
          <input
            class={fieldClass}
            bind:value={search}
            disabled={blocked || !layerId || sources.length >= 20}
            placeholder="Search by name or address…"
          >
        </label>
        <p class="text-muted-foreground text-xs">
          Searches published Features in the same layer. Adding a source resets the
          result below.
        </p>
        {#if searching}
          <p role="status" class="text-muted-foreground text-sm">Searching…</p>
        {/if}
        {#if searchError}
          <p role="alert" class="text-error text-sm">{searchError}</p>
        {/if}
        <div class="grid gap-2 sm:grid-cols-2">
          {#each matches as candidate}
            {@const title = getI18n(
              candidate,
              'title',
              view.getUserPreferences(),
              candidate.id,
            )}
            <button
              type="button"
              class="border-border hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-primary grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-2 text-left focus-visible:outline-2"
              disabled={blocked}
              onclick={() => run(() => addCandidate(candidate.id))}
            >
              {#if candidate.image}
                <img
                  class="h-12 w-12 rounded-lg object-cover"
                  src={getURLfromImage({ image: candidate.image })}
                  alt=""
                >
              {:else}
                <div class="bg-primary/10 h-12 w-12 rounded-lg"></div>
              {/if}
              <span class="min-w-0 text-sm break-words whitespace-normal">{title}</span
              ><span aria-hidden="true" class="text-primary">+</span>
            </button>
          {/each}
        </div>
        {#if search.trim() && !searching && !matches.length && !searchError}
          <p class="text-muted-foreground text-sm">
            No matching Features. Try another name or address.
          </p>
        {/if}
      {:else if sources.length}
        <label class="text-muted-foreground flex items-start gap-2 text-sm"
          ><input
            class="accent-primary mt-0.5"
            type="checkbox"
            bind:checked={keepOriginal}
            disabled={blocked}
            onchange={() => {
              outputs[0].featureId = keepOriginal ? featureId : null
            }}
          >Keep the original link for the first result. Otherwise, both results get new
          links.</label
        >
      {/if}
    </section>

    {#if outputs.length}
      <section class="grid gap-3" aria-label="Result editor">
        <div class="flex items-baseline gap-3">
          <span class="text-primary text-xs font-medium">02</span>
          <h3 class="text-sm font-semibold">
            {kind === 'split' ? 'Shape each result' : 'Shape the merged Feature'}
          </h3>
        </div>
        <p class="text-muted-foreground text-sm">
          Name the results and choose their photos. Changes stay here until you save a
          proposal and publish it after review.
        </p>
        <div
          class={`grid items-start gap-4 ${kind === 'split' ? 'lg:grid-cols-2' : 'mx-auto w-full max-w-2xl'}`}
        >
          {#each outputs as output, index}
            <FeatureIdentityOutput
              bind:output={outputs[index]}
              {sources}
              {index}
              {kind}
              {blocked}
              onSource={id => selectSource(index, id)}
              onImage={(sourceId, imageId, checked) =>
                selectImage(index, sourceId, imageId, checked)}
              onMove={(imageIndex, offset) => moveImage(index, imageIndex, offset)}
              onProperty={(propertyId, sourceId) =>
                selectProperty(index, propertyId, sourceId)}
              onRemove={kind === 'split' && index > 1
                ? () => outputs.splice(index, 1)
                : undefined}
            />
          {/each}
        </div>
        {#if kind === 'split'}
          <button
            type="button"
            class={`${fieldClass} justify-self-start`}
            disabled={blocked || outputs.length >= 20}
            onclick={() => outputs.push(makeOutput(sources[0], null))}
          >
            + Add another result
          </button>
        {/if}
      </section>
      <div class="border-border bg-primary/5 grid gap-3 rounded-xl border p-4">
        <label class="grid gap-2 text-sm font-medium"
          >Why this change?<textarea
            class={fieldClass}
            rows="2"
            placeholder={kind === 'split'
              ? 'Explain why these should be separate Features…'
              : 'Explain why these Features belong together…'}
            bind:value={reason}
            disabled={blocked}
          ></textarea></label
        >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-muted-foreground text-xs">
            Saving a proposal does not change the published Features.
          </p>
          <button
            type="button"
            class={primaryClass}
            disabled={blocked || !ready || !reason.trim()}
            onclick={() => run(propose)}
          >
            {busy ? 'Working…' : 'Save proposal & review'}
          </button>
        </div>
      </div>
    {/if}

    {#if queue.length}
      <details class="border-border rounded-xl border p-4">
        <summary class="cursor-pointer text-sm font-medium">
          Previous proposals <span class="text-muted-foreground">({queue.length})</span>
        </summary>
        <div class="mt-3 grid gap-2">
          {#each queue as proposal}
            <button
              type="button"
              class={`${fieldClass} flex items-center justify-between text-left`}
              disabled={blocked}
              onclick={() => run(() => openReview(proposal.id))}
            >
              <span>{proposal.kind === 'split' ? 'Split' : 'Merge'} proposal</span
              ><span class="text-muted-foreground text-xs"
                >{proposal.outcome ?? 'Awaiting review'}
                →</span
              >
            </button>
          {/each}
        </div>
      </details>
    {/if}
    {#if review}
      <section
        class="border-primary/30 bg-primary/5 grid gap-4 rounded-2xl border p-4 sm:p-5"
        aria-label="Identity proposal review"
      >
        <div class="flex items-baseline gap-3">
          <span class="text-primary text-xs font-medium">03</span>
          <h3 class="text-base font-semibold">Review before publishing</h3>
        </div>
        <p class="text-sm">{review.reason}</p>
        <div class="grid items-start gap-4 lg:grid-cols-2">
          {#each review.records.filter(record => record.role === 'output') as record}
            <article
              class="border-border bg-background min-w-0 overflow-hidden rounded-xl border"
            >
              <div class="bg-primary/5 flex overflow-x-auto">
                {#each record.content.gallery.order as imageId}
                  {@const sourceId =
                    review.records.find(
                      source =>
                        source.role === 'input' &&
                        source.content.gallery.entries[imageId]?.imageRevisionId ===
                          record.content.gallery.entries[imageId].imageRevisionId,
                    )?.featureId ?? record.featureId}
                  <img
                    class="h-48 min-w-0 flex-1 object-cover"
                    src={`/api/images/revisions/${record.content.gallery.entries[imageId].imageRevisionId}?feature=${encodeURIComponent(sourceId)}`}
                    alt="Reviewed output gallery"
                  >
                {/each}
              </div>
              <div class="grid gap-3 p-4">
                <h4 class="text-base font-semibold break-words whitespace-normal">
                  {record.content.translations.en?.title.value ||
                    Object.values(record.content.translations)[0]?.title.value ||
                    record.featureId}
                </h4>
                <p class="text-muted-foreground text-xs">
                  {review.records.some(
                    source =>
                      source.role === 'input' && source.featureId === record.featureId,
                  )
                    ? 'Keeps an original link'
                    : 'New Feature link'}
                  · {record.content.gallery.order.length} photos
                </p>
                <details>
                  <summary class="text-muted-foreground cursor-pointer text-xs">
                    Review all content
                  </summary>
                  <dl class="mt-3 grid gap-3 text-sm">
                    {#each Object.entries(
                      record.content.translations,
                    ) as [locale, text]}
                      <div>
                        <dt class="text-muted-foreground text-xs font-medium">
                          {locale}
                        </dt>
                        <dd class="break-words whitespace-pre-wrap">
                          {text.title.value}<br>{text.description.value ?? ''}<br>
                          {text.address.value ?? ''}
                        </dd>
                      </div>
                    {/each}
                    <div>
                      <dt class="text-muted-foreground text-xs">Location</dt>
                      <dd>
                        {record.content.placement.location?.locationId ??
                          'Independent placement'}
                      </dd>
                    </div>
                    {#each Object.entries(record.content.properties) as [id, property]}
                      <div>
                        <dt class="text-muted-foreground text-xs">
                          {Object.values(property.selection.definition.labels)[0]
                            ?.value ?? id}
                        </dt>
                        <dd class="break-words whitespace-pre-wrap">
                          {property.selection.value ??
                            property.selection.valueJson ??
                            property.selection.definition.selectedOption?.value ??
                            '—'}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                </details>
              </div>
            </article>
          {/each}
        </div>
        <details class="border-border rounded-lg border p-3">
          <summary class="text-muted-foreground cursor-pointer text-sm">
            Original Features & retained history
          </summary>
          <ul class="mt-3 grid gap-2">
            {#each review.records.filter(record => record.role === 'input') as record}
              <li>
                <a
                  class="text-sm break-words whitespace-normal underline"
                  href={`/admin/features/${encodeURIComponent(record.featureId)}#updates`}
                  >{record.content.translations.en?.title.value ||
                    Object.values(record.content.translations)[0]?.title.value ||
                    record.featureId}</a
                >
              </li>
            {/each}
          </ul>
        </details>
        <p class="text-sm">
          Relationships: {review.relations.openTasks} open tasks,
          {review.relations.completedTasks}
          completed tasks,
          {review.relations.visits}
          visits and {review.relations.wishlists} wishlist links.
        </p>
        <p class="text-muted-foreground text-sm">
          Visits and completed tasks keep their original Feature. Import crosswalks are
          unchanged.
          {review.kind === 'merge'
            ? 'Wishlist links move to the survivor; overlaps are combined.'
            : 'Wishlist links stay on the original Feature with guidance to its successors.'}
        </p>
        {#each review.tasks as task}
          <label class="grid gap-1 text-sm"
            >{taskLabels[task.type] ?? task.type}
            · {task.id}{task.isDraft ? ' (draft)' : ''}
            · from {task.featureId}
            <select
              class={fieldClass}
              bind:value={destinations[task.id]}
              disabled={blocked || Boolean(review.outcome)}
            >
              <option value="">Choose a resulting Feature</option>
              {#each review.records.filter(
                record => record.role === 'output',
              ) as output}
                <option value={output.featureId}>
                  {Object.values(output.content.translations)[0]?.title.value ||
                    output.featureId}
                  · {output.featureId}
                </option>
              {/each}
            </select>
          </label>
          <a
            class="text-sm break-words whitespace-normal underline"
            href={`/admin/tasks/${encodeURIComponent(task.id)}`}
            >Review task evidence</a
          >
        {/each}
        {#if !review.outcome}
          <label class="flex items-start gap-2 text-sm"
            ><input type="checkbox" bind:checked={retain} disabled={blocked}>I have
            reviewed the task destinations and wishlist handling.</label
          >
          <label class="grid gap-1 text-sm"
            >Decision reason<textarea
              class={fieldClass}
              bind:value={decisionReason}
              disabled={blocked}
            ></textarea></label
          >
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class={primaryClass}
              disabled={blocked ||
                !retain ||
                !decisionReason.trim() ||
                review.tasks.some(task => !destinations[task.id])}
              onclick={() => run(() => decide(true))}
            >
              Publish {review.kind}
            </button>
            <button
              type="button"
              class={fieldClass}
              disabled={blocked || !decisionReason.trim()}
              onclick={() => run(() => decide(false))}
            >
              Reject proposal
            </button>
          </div>
        {:else}
          <p class="text-sm">Decision: {review.outcome}</p>
        {/if}
      </section>
    {/if}
    {#if message}
      <p
        role="status"
        class="border-border rounded-lg border p-3 text-sm whitespace-pre-wrap"
      >
        {message}
      </p>
    {/if}
  </div>
</details>
