<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// PRIMITIVES
import MorphDialog from '#lib/bits/core/dialog/MorphDialog.svelte'
import { transitionReviewDialog } from '#lib/bits/core/dialog/dialogTransition.js'
import Row from '#lib/bits/custom/rows/Row.svelte'
import RowThumbnail from '#lib/bits/custom/rows/src/RowThumbnail.svelte'
import { getFeatureIdenticonUrl } from '#lib/client/services/image.js'
import { getI18n } from '#lib/i18n.js'
// API
import {
  inspectCreationDuplicate,
  applyCreationDuplicate,
} from '#lib/api/featureCreationDuplicate.remote.js'
import {
  inspectFeatureIdentity,
  applyFeatureIdentity,
} from '#lib/api/featureIdentity.remote.js'
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// DOMAIN
import { featurePoint, featureDistance } from '#lib/features/nearby.js'
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
import FeatureMergeReview from './FeatureMergeReview.svelte'
import { identityTitle } from './featureIdentity.types'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { IdentitySource } from './featureIdentity.types'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'

let {
  open = $bindable(false),
  kind,
  featureId,
  layerId,
  duplicateTaskId,
  creationProposal,
  sourceGeometry,
  onApplied,
  duplicateChoice = false,
  source = null,
  onDiscard,
}: {
  sourceGeometry?: import('geojson').GeometryObject | null
  duplicateChoice?: boolean
  source?: HTMLElement | null
  onDiscard?: () => Promise<boolean>
  open?: boolean
  kind: 'split' | 'merge'
  featureId: string
  layerId: string
  duplicateTaskId?: string
  creationProposal?: boolean
  onApplied: (ids: string[]) => Promise<void>
} = $props()
const view = getSurfaceCtx()
// Pending contributions cannot be the existing Feature kept by a merge.
const mergeCandidateConditions = {
  isArchived: false,
  isPublished: null,
  isPendingReview: false,
}
let sources = $state<IdentitySource[]>([])
let names = $state(['', ''])
let redirect = $state('none')
let search = $state('')
let matches = $state<Feature[]>([])
let nearby = $state<Feature[]>([])
let nearbyLoading = $state(false)
const origin = $derived(featurePoint(sourceGeometry))
let choosing = $state(false)
let busy = $state(false),
  message = $state('')
let output = $state<FeatureIdentitySelection['outputs'][number] | null>(null)
let creationTokens = $state<{
  proposalId: string
  version: string
  modifiedAt: string
  imageReviewId: string | null
} | null>(null)
let request = 0
const field =
  'w-full min-w-0 rounded-lg border border-foreground/12 bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary'
const action =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground/12 px-4 py-2 text-sm text-foreground/78 transition hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40'
const primary = $derived(sources[0])
const candidate = $derived(sources[1])
const locale = $derived(
  primary
    ? primary.content.translations.en
      ? 'en'
      : Object.keys(primary.content.translations)[0]
    : 'en',
)

/** Inspect current accepted content; stale requests never replace another modal's state. */
async function load(ids: string[]): Promise<void> {
  const token = ++request
  busy = true
  message = ''
  try {
    const creation =
      creationProposal && duplicateTaskId
        ? await refreshRemoteQuery(
            inspectCreationDuplicate({
              taskId: duplicateTaskId,
              primaryId: ids[0],
              meta: { isAdminRequest: true },
            }),
          )
        : null
    const values =
      creation?.sources ??
      (await refreshRemoteQuery(
        inspectFeatureIdentity({
          featureIds: ids,
          duplicateTaskId,
          meta: { isAdminRequest: true },
        }),
      ))
    if (token !== request || !open) return
    await transitionReviewDialog(() => {
      if (token !== request || !open) return
      creationTokens = creation
      sources = values
      const first = values[0]
      names = [identityTitle(first), identityTitle(first)]
      output = {
        featureId: first.featureId,
        sourceFeatureId: first.featureId,
        titles: Object.fromEntries(
          [
            ...new Set(
              values.flatMap(source => Object.keys(source.content.translations)),
            ),
          ].map(key => [
            key,
            first.content.translations[key]?.title.value ||
              values[1]?.content.translations[key]?.title.value ||
              '',
          ]),
        ),
        descriptions: Object.fromEntries(
          [
            ...new Set(
              values.flatMap(source => Object.keys(source.content.translations)),
            ),
          ].map(key => [
            key,
            first.content.translations[key]?.description.value ??
              values[1]?.content.translations[key]?.description.value ??
              null,
          ]),
        ),
        images: [],
        properties: [],
        propertyEdits: {},
        propertyTranslationEdits: {},
        coverImageId: first.content.gallery.order.find(
          id => first.content.gallery.entries[id].intent === 'canonical',
        ),
        profileEdits: {
          isIntangible: first.content.profile.isIntangible,
          isVisitable: first.content.profile.visitability.isVisitable,
          asOf:
            values
              .map(source => source.content.profile.visitability.asOf)
              .filter((date): date is string => Boolean(date))
              .sort()
              .at(-1) ?? null,
        },
      }
      // Prefer the primary's populated fields, filling gaps from the candidate.
      for (const id of new Set(
        values.flatMap(source => Object.keys(source.content.properties)),
      )) {
        const chosen =
          values.find(source => {
            const row = source.content.properties[id]?.selection
            return (
              row &&
              (row.value != null ||
                row.valueJson != null ||
                row.propertyValueId != null)
            )
          }) ?? values.find(source => source.content.properties[id])!
        output.properties!.push({ propertyId: id, sourceFeatureId: chosen.featureId })
      }
      // Existing gallery photos start in Keep; incoming photos remain in Discard until selected.
      for (const imageId of first.content.gallery.order)
        output.images!.push({
          sourceFeatureId: first.featureId,
          imageId,
          intent:
            imageId === output.coverImageId
              ? 'canonical'
              : first.content.gallery.entries[imageId].intent,
        })
      search = ''
      matches = []
    })
  } catch (cause) {
    if (token === request)
      message = cause instanceof Error ? cause.message : 'Unable to load Features'
  } finally {
    if (token === request) busy = false
  }
}
$effect(() => {
  const shown = open,
    id = featureId
  untrack(() => {
    if (shown) {
      choosing = duplicateChoice
      sources = []
      output = null
      search = ''
      matches = []
      redirect = 'none'
      if (!creationProposal && !duplicateChoice) void load([id])
    } else {
      request++
      busy = false
    }
  })
})
$effect(() => {
  const point = origin,
    shown = open && !choosing && !candidate && kind === 'merge',
    layer = layerId,
    excluded = featureId
  nearby = []
  nearbyLoading = false
  if (!shown || !point) return
  let cancelled = false
  nearbyLoading = true
  void refreshRemoteQuery(
    getFeatureIndexPage({
      nearby: { coordinates: point, excludeId: excluded },
      prisms: { layer: [layer] },
      conditions: mergeCandidateConditions,
      pagination: { limit: 5, offset: 0 },
      includeCount: false,
      meta: { ...view.resources.queryMeta, isAdminRequest: true, profile: 'admin' },
    }),
  )
    .then(result => {
      if (!cancelled) nearby = result.data as Feature[]
    })
    .catch(() => {
      if (!cancelled) message = 'Nearby features unavailable. Search by name instead.'
    })
    .finally(() => {
      if (!cancelled) nearbyLoading = false
    })
  return () => {
    cancelled = true
  }
})
$effect(() => {
  const text = search.trim(),
    shown = open,
    layer = layerId
  matches = []
  if (!shown || !text || kind !== 'merge') return
  let cancelled = false
  const timer = setTimeout(async () => {
    try {
      const result = await refreshRemoteQuery(
        getFeatureIndexPage({
          q: text,
          prisms: { layer: [layer] },
          conditions: mergeCandidateConditions,
          pagination: { limit: 12, offset: 0 },
          includeCount: false,
          meta: { ...view.resources.queryMeta, isAdminRequest: true, profile: 'admin' },
        }),
      )
      if (!cancelled)
        await transitionReviewDialog(() => {
          if (!cancelled)
            matches = (result.data as Feature[]).filter(row => row.id !== featureId)
        })
    } catch (cause) {
      if (!cancelled)
        message = cause instanceof Error ? cause.message : 'Search unavailable'
    }
  }, 250)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
})
/** Apply the inspected choices and return the resulting regular editor destinations. */
async function apply(): Promise<void> {
  if (busy || !primary || !output) return
  busy = true
  message = ''
  try {
    const selection = {
      kind,
      inputs: sources.map(({ featureId, revisionId, generation }) => ({
        featureId,
        revisionId,
        generation,
      })),
      outputs:
        kind === 'split'
          ? names.map(name => ({
              featureId: null,
              sourceFeatureId: primary.featureId,
              titles: { [locale]: name.trim() },
            }))
          : [output],
      redirectOutputIndex:
        kind === 'split' && redirect !== 'none' ? Number(redirect) : null,
      reason:
        kind === 'split' ? 'Staff split Feature' : 'Staff merged duplicate Features',
    }
    const result =
      creationProposal && duplicateTaskId && creationTokens
        ? await applyCreationDuplicate({
            taskId: duplicateTaskId,
            primaryId: primary.featureId,
            ...creationTokens,
            selection,
            meta: { isAdminRequest: true },
          })
        : await applyFeatureIdentity({
            ...selection,
            duplicateTaskId,
            meta: { isAdminRequest: true },
          })
    open = false
    await onApplied(result.outputs)
  } catch (cause) {
    message = submissionErrorMessage(cause) ?? 'Unable to apply changes'
  } finally {
    busy = false
  }
}
</script>

<MorphDialog
  bind:open
  {source}
  {busy}
  wide={!choosing && kind === 'merge' && Boolean(candidate && output)}
  showFooter={!choosing && (kind === 'split' || Boolean(candidate && output))}
  title={choosing
    ? 'Duplicate Feature'
    : kind === 'split'
      ? 'Split Feature'
      : 'Merge Features'}
  description={choosing
    ? 'Merge useful information and photos into an existing Feature, or discard this contribution.'
    : kind === 'split'
      ? 'Create two Features from this one, then edit them separately.'
      : candidate
        ? 'Move useful details and photos from Discard to Keep. Check the result on the right before merging.'
        : origin
          ? duplicateTaskId
            ? 'Select a nearby Feature to keep, or search by name.'
            : 'Select a nearby Feature to merge into this one, or search by name.'
          : duplicateTaskId
            ? 'Find the Feature you want to keep.'
            : 'Find the Feature to merge into this one.'}
>
  <div class="grid min-w-0 gap-6">
    {#if choosing}
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] items-stretch gap-3">
        <button
          type="button"
          class={action}
          disabled={busy}
          onclick={async () => {
            if (!onDiscard || busy) return
            busy = true
            try {
              if (await onDiscard()) open = false
            } finally {
              busy = false
            }
          }}
        >
          Discard
        </button>
        <button
          type="button"
          class="bg-primary text-primary-content hover:bg-primary/90 inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-45"
          disabled={busy}
          onclick={() =>
            transitionReviewDialog(() => {
              choosing = false
              if (!creationProposal) void load([featureId])
            })}
        >
          Merge with existing
        </button>
      </div>
    {:else}
      {#if message}
        <p role="alert" class="text-sm text-red-600">{message}</p>
      {/if}
      {#if primary && kind === 'split'}
        {#each names as name, index}
          <label class="grid gap-2 text-sm font-medium"
            >Feature {index + 1} name
            <input class={field} bind:value={names[index]} disabled={busy}>
          </label>
        {/each}
        <label class="grid gap-2 text-sm font-medium"
          >Automatic redirect
          <select class={field} bind:value={redirect} disabled={busy}>
            <option value="none">Show links to both Features</option>
            {#each names as name, index}
              <option value={String(index)}>{name || `Feature ${index + 1}`}</option>
            {/each}
          </select>
          <span class="text-muted-foreground font-normal"
            >The redirect becomes active when the chosen Feature is published. The
            original is unpublished and archived.</span
          >
        </label>
      {:else if kind === 'merge'}
        {#if !candidate}
          <label class="grid gap-2 text-sm font-medium"
            >{duplicateTaskId ? 'Find the existing Feature' : 'Find another Feature'}
            <input
              class={field}
              bind:value={search}
              disabled={busy}
              placeholder="Search by name"
            >
          </label>
          {#if !search.trim() && origin}
            <p class="text-muted-foreground text-sm">
              {#if nearbyLoading}
                <LoadingSkeleton
                  label="Loading nearby features…"
                  text="Nearby features"
                />
              {:else}
                {nearby.length
                  ? 'Nearby features'
                  : 'No nearby features available. Search by name instead.'}
              {/if}
            </p>
          {/if}
          {#if nearbyLoading && !search.trim()}
            <ContentSkeleton label="Loading nearby features"
              ><div class="grid min-w-0 gap-2">
                {#each Array(3) as _, index (index)}
                  <Row
                    {index}
                    entityId={`pending-${index}`}
                    onclick={() => {}}
                    onkeydown={() => {}}
                    class="grid-cols-[auto_minmax(0,1fr)] gap-4 pr-3"
                    ><div class="bg-foreground/10 size-16 rounded-md"></div>
                    <div class="grid min-w-0 gap-1 py-1 text-left">
                      <p class="font-semibold">Feature name</p>
                      <p class="text-sm">Feature address</p>
                    </div></Row
                  >
                {/each}
              </div></ContentSkeleton
            >
          {/if}
          {#if search.trim() || nearby.length}
            <section
              class="grid min-w-0 gap-2"
              aria-label={search.trim() ? 'Matching Features' : 'Nearby features'}
            >
              {#each search.trim() ? matches : nearby as match, index (match.id)}
                <Row
                  {index}
                  entityId={match.id}
                  class="grid-cols-[auto_minmax(0,1fr)] gap-4 pr-3"
                  onclick={() => {
                    if (!busy)
                      void load(
                        duplicateTaskId ? [match.id, featureId] : [featureId, match.id],
                      )
                  }}
                  onkeydown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      if (!busy)
                        void load(
                          duplicateTaskId
                            ? [match.id, featureId]
                            : [featureId, match.id],
                        )
                    }
                  }}
                >
                  <RowThumbnail
                    image={match.image}
                    imageSrc={match.image
                      ? undefined
                      : getFeatureIdenticonUrl(match.id)}
                  />
                  <!-- Picker options use the full row width and wrap instead of scrolling table labels. -->
                  <div class="grid min-w-0 gap-1 py-1 text-left">
                    <div
                      class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
                    >
                      <span class="min-w-0 font-semibold break-words whitespace-normal"
                        >{getI18n(
                          match,
                          'title',
                          view.getUserPreferences(),
                          match.id,
                          true,
                        )}</span
                      >
                      {#if origin && featurePoint(match.geometry)}
                        <span class="text-sm font-medium whitespace-nowrap text-red-500"
                          >{Math.round(
                            featureDistance(origin, featurePoint(match.geometry)!),
                          )}
                          m</span
                        >
                      {/if}
                    </div>
                    <span
                      class="text-muted-foreground min-w-0 text-sm break-words whitespace-normal"
                      >{getI18n(
                        match,
                        'displayAddress',
                        view.getUserPreferences(),
                        '',
                        true,
                      )}</span
                    >
                  </div>
                </Row>
              {/each}
            </section>
          {/if}
        {/if}
        {#if primary && output && candidate}
          <FeatureMergeReview
            {sources}
            bind:output
            {busy}
            onReplace={() =>
              transitionReviewDialog(() => {
                request++
                sources = []
                output = null
                search = ''
                matches = []
                creationTokens = null
              })}
          />
        {/if}
      {/if}
    {/if}
  </div>
  {#snippet footer()}
    <button
      type="button"
      class="bg-primary text-primary-content hover:bg-primary/90 inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-45"
      disabled={busy ||
        !primary ||
        (kind === 'split' ? names.some(name => !name.trim()) : !candidate)}
      onclick={apply}
    >
      {busy ? 'Working…' : kind === 'split' ? 'Create two Features' : 'Merge Features'}
    </button>
  {/snippet}
</MorphDialog>
