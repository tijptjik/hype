<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
import { toast } from 'svelte-sonner'
import { researchErrorMessage } from '#lib/fieldResearch/presentation.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import SaveIcon from 'virtual:icons/lucide/save'
import { beforeNavigate, goto } from '$app/navigation'
// I18N
import { m } from '#lib/i18n.js'
// API
import {
  getResearchDestinations,
  mergeResearchCaptures,
  getResearchSessions,
  archiveResearchSessions,
  getResearchSessionFilters,
  createResearchSession,
  getResearchSession,
  getResearchImages,
  getResearchLayers,
  clusterResearchSession,
  moveResearchCapture,
  placeResearchCapture,
  updateResearchStack,
  saveResearchFeatures,
  configureResearchLayer,
  updateResearchSession,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Heading from '#lib/bits/custom/text/Heading.svelte'
import Subheading from '#lib/bits/custom/text/Subheading.svelte'
import * as ImportPrimitive from '#lib/bits/patterns/import/components/index.js'
import ResearchMap from './ResearchMap.svelte'
import ResearchSessionRow from './ResearchSessionRow.svelte'
import ResearchSessionControls from './ResearchSessionControls.svelte'
// ICONS
import Funnel from 'virtual:icons/proicons/filter'
import FunnelX from 'virtual:icons/proicons/filter-cancel'
import CloudArrowUp from 'virtual:icons/proicons/cloud-arrow-up'
import OrganisationIcon from 'virtual:icons/lucide/users'
import UploadIcon from 'virtual:icons/proicons/arrow-upload'
import XIcon from 'virtual:icons/lucide/x'
import { getURLfromImage } from '#lib/client/services/image.js'
import CheckIcon from 'virtual:icons/lucide/check'
// DOMAIN
import { runResearchQueue } from '#lib/fieldResearch/queue.js'
import { createResearchThumbnail } from '#lib/fieldResearch/thumbnail.js'
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '#lib/images/accept.js'
import { calculateImageContentHash } from '#lib/client/services/image.js'
import { researchCoordinates } from '#lib/fieldResearch/model.js'
import { extractImageUploadMetadata } from '#lib/images/metadata.js'
import { normalizeUploadFileForAssetPipeline } from '#lib/images/upload.js'
// TYPES
import type {
  ResearchSession,
  ResearchSessionIndexRow,
  ResearchSessionFilters,
  ResearchImage,
  ResearchStack,
  ResearchCoordinates,
} from '#lib/fieldResearch/model.js'
import type { DropzoneEvent } from '#lib/bits/patterns/import/import.types.js'

type QueueItem = {
  id: string
  file: File | null
  name: string
  status: 'queued' | 'uploading' | 'uploaded' | 'failed'
  error?: string
}
let destinations = $state<Awaited<ReturnType<typeof getResearchDestinations>>>([])
let indexFilters = $state<ResearchSessionFilters>({
  archive: 'active',
  creatorId: '',
  organisationId: '',
  projectId: '',
  layerId: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
})
let filterOptions = $state<Awaited<ReturnType<typeof getResearchSessionFilters>>>({
  creators: [],
  organisations: [],
  projects: [],
  layers: [],
})
let controlBarVisible = $state(true)
let bulkMode = $state(false)
let selectedSessions = $state<{ id: string; revision: number }[]>([])
let bulkAction = $state('archive')
let selectingAll = $state(false)
let indexVersion = $state(0)

/** Toggle a row in the current bulk selection without opening its workspace.
 * @param row Session and revision shown in the index. @returns Nothing.
 */
function toggleSessionSelection(row: ResearchSessionIndexRow): void {
  selectedSessions = selectedSessions.some(item => item.id === row.id)
    ? selectedSessions.filter(item => item.id !== row.id)
    : [...selectedSessions, { id: row.id, revision: row.revision }]
}

/** Load all matches for the current filters before selecting them.
 * @returns When the complete bounded selection is ready.
 */
async function selectAllSessions(): Promise<void> {
  selectingAll = true
  const request = indexRequest
  try {
    const selected: { id: string; revision: number }[] = []
    let before: string | undefined
    for (;;) {
      const rows = await refreshRemoteQuery(getResearchSessions({ ...request, before }))
      if (request !== indexRequest || !bulkMode) return
      selected.push(...rows.map(row => ({ id: row.id, revision: row.revision })))
      if (selected.length > 5000)
        throw new Error('Narrow the filters to select up to 5,000 sessions at once.')
      if (rows.length < 50) break
      before = rows[rows.length - 1].id
    }
    selectedSessions = selected
  } catch (cause) {
    toast.error(researchErrorMessage(cause))
  } finally {
    selectingAll = false
  }
}

/** Archive or restore the observed selection, then reload counts and choices.
 * @returns Once the atomic operation and index refresh have been requested.
 */
async function applySessionArchive(): Promise<void> {
  await action(async () => {
    const result = await archiveResearchSessions({
      sessions: selectedSessions,
      archived: bulkAction === 'archive',
    })
    selectedSessions = []
    bulkMode = false
    indexVersion += 1
    toast.success(
      `${result.count} ${result.count === 1 ? 'session' : 'sessions'} ${bulkAction === 'archive' ? 'archived' : 'restored'}.`,
    )
  })
}

let sessionCount = $state(0)
let sessions = $state<ResearchSessionIndexRow[]>([])
let session = $state<ResearchSession | null>(null)
let images = $state.raw<ResearchImage[]>([])
let stacks = $state.raw<ResearchStack[]>([])
let layers = $state<Awaited<ReturnType<typeof getResearchLayers>>>([])
let projectId = $state('')
let projectQuery = $state('')
let sessionQuery = $state('')
const indexRequest = $derived({
  query: sessionQuery,
  archive: indexFilters.archive,
  creatorId: indexFilters.creatorId || undefined,
  organisationId: indexFilters.organisationId || undefined,
  projectId: indexFilters.projectId || undefined,
  layerId: indexFilters.layerId || undefined,
  sortBy: indexFilters.sortBy,
  sortOrder: indexFilters.sortOrder,
})
let indexLoading = $state(false)
const suggestedDestinations = $derived(
  destinations.filter(item =>
    `${item.name} ${item.projectName}`
      .toLowerCase()
      .includes(projectQuery.trim().toLowerCase()),
  ),
)
let name = $state('')
let creating = $state(false)
let selected = $state<string | null>(null)
let layerId = $state('')
let queue = $state<QueueItem[]>([])
let uploading = $state(false)
let busy = $state(false)
let message = $state('')
let hasMoreSessions = $state(false)
const completed = $derived(queue.filter(item => item.status === 'uploaded').length)
const failed = $derived(queue.filter(item => item.status === 'failed').length)
const editable = $derived(
  Boolean(session && session.status !== 'completed' && !uploading && !busy),
)
const types = $derived(
  layers
    .find(layer => layer.id === layerId)
    ?.types.filter(type => type.enabled !== false) ?? [],
)
const controls =
  'rounded-lg border border-base-content/20 bg-base-100/40 px-3 py-2 text-sm'
beforeNavigate(navigation => {
  if (uploading || queue.some(item => item.file && item.status !== 'uploaded'))
    navigation.cancel()
})

onMount(() => {
  void action(async () => {
    destinations = await getResearchDestinations({})
  })
})

/** Read the active session identity and revision before a mutation.
 * @returns Required server mutation scope. @throws If no session is open.
 */
function currentSessionVersion(): { sessionId: string; revision: number } {
  if (!session) throw new Error('Open a research session first')
  return { sessionId: session.id, revision: session.revision }
}

/** Surface a recoverable operation failure and keep the session available.
 * @param work Requested operation. @returns Once feedback and busy state settle.
 */
async function action(work: () => Promise<void>): Promise<void> {
  if (busy) return
  busy = true
  message = ''
  try {
    await work()
  } catch (cause) {
    toast.error(researchErrorMessage(cause))
  } finally {
    busy = false
  }
}

/** Refresh all lightweight capture pages with bounded requests, never fetching full image bytes.
 * @returns Once the active session's complete map inventory is available.
 */
async function refresh(): Promise<void> {
  if (!session) return
  const id = session.id
  const result = await refreshRemoteQuery(getResearchSession({ sessionId: id }))
  const rows: ResearchImage[] = []
  let after: string | undefined
  for (;;) {
    const chunk = await refreshRemoteQuery(getResearchImages({ sessionId: id, after }))
    rows.push(...chunk)
    if (chunk.length < 200) break
    after = chunk[chunk.length - 1].id
  }
  session = result.session
  stacks = result.stacks
  images = rows
  if (!stacks.some(stack => stack.id === selected)) selected = null
}

/** Open a retained session and its project-specific conversion destinations.
 * @param value Session to open.
 * @param retainQueue Keep files picked before starting this session.
 * @returns Once session state is loaded.
 */
async function open(value: ResearchSession, retainQueue = false): Promise<void> {
  session = value
  name = value.name
  selected = null
  if (!retainQueue) queue = []
  await refresh()
  layers = await getResearchLayers({ sessionId: value.id })
  layerId = value.layerId ?? ''
}

/** Queue files with stable identities; normalization and transfer run only inside bounded workers.
 * @param event Shared batch upload drop/select event. @returns Once this queue settles.
 */
async function addFiles(event: DropzoneEvent): Promise<void> {
  if (uploading || busy || session?.status === 'completed') return
  if (event.fileRejections?.length)
    message = `${event.fileRejections.length} files were not accepted as images.`
  const next = event.acceptedFiles.map(file => ({
    id: crypto.randomUUID(),
    file,
    name: file.name,
    status: 'queued' as const,
  }))
  for (const item of next) queue.push(item)
  await uploadPending()
}

/** Retain failed files for retry and release successful file references immediately.
 * @returns Once every queued image has been attempted and the durable state is reloaded.
 */
async function uploadPending(): Promise<void> {
  if (!session || uploading) return
  uploading = true
  const id = session.id
  const claimed = new Set(queue.map(item => item.id))
  try {
    await runResearchQueue(
      queue.filter(item => item.status === 'queued' || item.status === 'failed'),
      async item => {
        if (!item.file) return
        item.status = 'uploading'
        item.error = undefined
        try {
          const extracted = await extractImageUploadMetadata(item.file)
          const normalized = await normalizeUploadFileForAssetPipeline(item.file)
          // Reselecting an interrupted upload resumes its reserved identity instead of duplicating it.
          const hash = await calculateImageContentHash(normalized.file)
          const pending = images.find(
            image =>
              image.state === 'uploading' &&
              image.contentHash === hash &&
              (image.id === item.id || !claimed.has(image.id)),
          )
          if (pending) {
            item.id = pending.id
            claimed.add(pending.id)
          }
          const form = new FormData()
          form.set('file', normalized.file)
          form.set(
            'thumbnail',
            await createResearchThumbnail(normalized.file),
            'thumbnail.jpg',
          )
          form.set(
            'metadata',
            JSON.stringify({
              originalFilename: item.name,
              originalWidth: normalized.originalWidth,
              originalHeight: normalized.originalHeight,
              capturedAt: extracted.capturedAt,
              cameraModel: extracted.cameraModel,
              credit: extracted.credit,
              coordinates: researchCoordinates(extracted.latitude, extracted.longitude),
            }),
          )
          const response = await fetch(`/api/fieldresearch/${id}/images/${item.id}`, {
            method: 'POST',
            body: form,
          })
          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(body.message ?? `Upload failed (${response.status})`)
          }
          item.status = 'uploaded'
          item.file = null
        } catch (cause) {
          item.status = 'failed'
          item.error = cause instanceof Error ? cause.message : String(cause)
        }
      },
    )
    await refresh()
    if (
      !queue.some(item => item.status === 'failed') &&
      session &&
      images.every(image => image.state === 'uploaded')
    ) {
      await clusterResearchSession({ sessionId: id, revision: session.revision })
      await refresh()
    }
  } catch (cause) {
    toast.error(researchErrorMessage(cause))
  } finally {
    uploading = false
  }
}

/** Move one image and reload the current optimistic session revision.
 * @param imageId Capture identity. @param targetStackId Destination or null for extraction.
 * @returns Once the mutation is reflected in both map and gallery.
 */
async function move(
  imageId: string,
  targetStackId: string | null,
  coordinates?: ResearchCoordinates,
): Promise<boolean> {
  if (!session || !editable) return false
  let saved = false
  await action(async () => {
    await moveResearchCapture({
      ...currentSessionVersion(),
      imageId,
      targetStackId,
      coordinates,
    })
    await refresh()
    saved = true
  })
  return saved
}

/** Set a stack pin separately from image capture GPS.
 * @param stackId Working group. @param coordinates Selected map location.
 * @returns Once the marker is persisted.
 */
async function place(
  stackId: string,
  coordinates: ResearchCoordinates,
): Promise<boolean> {
  if (!session || !editable) return false
  let saved = false
  await action(async () => {
    await placeResearchCapture({
      ...currentSessionVersion(),
      stackId,
      coordinates,
    })
    await refresh()
    saved = true
  })
  return saved
}

const mapView = $derived(
  Boolean(
    session?.layerId &&
      images.length &&
      !uploading &&
      !failed &&
      images.every(image => image.state === 'uploaded') &&
      stacks.length,
  ),
)
/** Persist a whole-stack merge and then settle the optimistic marker preview.
 * @param sourceStackId Stack being dragged. @param targetStackId Destination stack.
 * @returns Whether the edit was saved.
 */
async function merge(sourceStackId: string, targetStackId: string): Promise<boolean> {
  if (!session || !editable) return false
  let saved = false
  await action(async () => {
    await mergeResearchCaptures({
      ...currentSessionVersion(),
      sourceStackId,
      targetStackId,
    })
    selected = targetStackId
    await refresh()
    saved = true
  })
  return saved
}

/** Start an empty research form from the shared header New action.
 * @returns Nothing; no session is created until the upload is started.
 */
function startNew(): void {
  name = ''
  projectId = ''
  layerId = ''
  projectQuery = ''
  queue = []
  creating = true
  message = ''
}

/** Leave the workspace without converting or deleting retained provisional work.
 * @returns Once the saved-session index is refreshed.
 */
async function cancel(): Promise<void> {
  await action(async () => {
    session = null
    creating = false
    queue = []
    images = []
    stacks = []
    selected = null
    name = ''
    message = ''
    sessions = await refreshRemoteQuery(getResearchSessions(indexRequest))
    hasMoreSessions = sessions.length === 50
  })
}
const headerCtrl = getHeaderCtrl()
$effect(() => {
  const index = !session && !creating
  headerCtrl.setHeaderForIndex('Field research', UploadIcon, {
    showNew: index,
    showFilter: index,
    showFacets: false,
    showViewActions: true,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  headerCtrl.setCreateAction(index ? startNew : null, { disabled: busy })
  headerCtrl.setSearch(
    index
      ? {
          query: sessionQuery,
          placeholder: 'Search field research',
          onFilter: value => (sessionQuery = value),
        }
      : null,
  )
  headerCtrl.setViewActions(
    index
      ? [
          {
            text: m.menu_filters(),
            class: 'px-4',
            color: 'neutral',
            style: 'ghost',
            icon: controlBarVisible ? FunnelX : Funnel,
            alwaysHideLabel: true,
            hideLabelInstantly: true,
            attrs: {
              'aria-expanded': controlBarVisible,
              'aria-pressed': controlBarVisible,
            },
            onClick: () => {
              controlBarVisible = !controlBarVisible
            },
          },
        ]
      : [
          {
            text: 'Cancel',
            icon: XIcon,
            color: 'neutral',
            style: 'ghost',
            disabled: uploading || busy,
            onClick: cancel,
          },
          ...(mapView
            ? [
                {
                  text: 'Save',
                  icon: SaveIcon,
                  color: 'primary' as const,
                  style: 'none' as const,
                  disabled: !editable || !stacks.some(stack => !stack.featureId),
                  onClick: () =>
                    action(async () => {
                      const version = currentSessionVersion()
                      const result = await saveResearchFeatures(version)
                      toast.success(`${result.created} unpublished Features created.`)
                      await goto(
                        `/admin/features?${new URLSearchParams({
                          origin: 'field_research',
                          originId: version.sessionId,
                        })}`,
                      )
                    }),
                },
              ]
            : []),
        ],
  )
})
// Use the same layout-owned, fixed-height control region as the resource indexes.
$effect(() => {
  if (session || creating) {
    headerCtrl.clearControlBar()
    return
  }
  headerCtrl.setControlBar(
    ResearchSessionControls,
    {
      bulk: {
        isActive: bulkMode,
        selectedCount: selectedSessions.length,
        options: [
          { value: 'archive', label: 'Archive' },
          { value: 'restore', label: 'Restore' },
        ],
        selectedOptionValue: bulkAction,
        applyDisabled: !selectedSessions.length || busy || selectingAll || indexLoading,
        isSelectingAll: selectingAll,
        progress: busy
          ? {
              completed: 0,
              total: selectedSessions.length,
              errors: 0,
              isApplying: true,
            }
          : null,
        onToggleMode: () => {
          bulkMode = !bulkMode
          selectedSessions = []
        },
        onSelectAll: selectAllSessions,
        onInvertSelection: () => {
          selectedSessions = sessions
            .filter(row => !selectedSessions.some(item => item.id === row.id))
            .map(row => ({ id: row.id, revision: row.revision }))
        },
        onOptionChange: value => {
          bulkAction = value
        },
        onApply: applySessionArchive,
      },
      value: indexFilters,
      options: filterOptions,
      count: sessionCount,
      loading: indexLoading,
      onchange: value => {
        indexFilters = value
      },
    },
    { isVisible: controlBarVisible },
  )
})

onDestroy(() => {
  headerCtrl.clearControlBar()
  headerCtrl.setViewActions([])
  headerCtrl.setCreateAction(null)
  headerCtrl.setSearch(null)
})

// Recompute every association facet against the other selected facets.
$effect(() => {
  const { creatorId, organisationId, projectId, layerId, archive } = indexRequest
  void indexVersion
  let active = true
  void refreshRemoteQuery(
    getResearchSessionFilters({
      creatorId,
      organisationId,
      projectId,
      layerId,
      archive,
    }),
  )
    .then(options => {
      if (active) filterOptions = options
    })
    .catch(cause => {
      if (active) message = String(cause)
    })
  return () => {
    active = false
  }
})

// Search authorized sessions on the server, including records beyond the currently loaded page.
$effect(() => {
  const request = indexRequest
  void indexVersion
  selectedSessions = []
  if (session || creating) return
  let active = true
  indexLoading = true
  const timer = setTimeout(() => {
    void refreshRemoteQuery(getResearchSessions(request))
      .then(rows => {
        if (active) {
          sessions = rows
          sessionCount = rows[0]?.totalCount ?? 0
          hasMoreSessions = rows.length === 50
        }
      })
      .catch(cause => {
        if (active) message = String(cause)
      })
      .finally(() => {
        if (active) indexLoading = false
      })
  }, 200)
  return () => {
    active = false
    clearTimeout(timer)
  }
})

// Load setup destinations before a session exists; stale searches cannot replace newer results.
$effect(() => {
  const id = projectId
  if (session || !id) return
  let active = true
  void getResearchLayers({ projectId: id })
    .then(value => {
      if (active) layers = value
    })
    .catch(cause => {
      if (active) message = String(cause)
    })
  return () => {
    active = false
  }
})
</script>

{#if mapView && session}
  <div class="absolute inset-0 z-10">
    <ResearchMap
      sessionId={session.id}
      {stacks}
      {images}
      {selected}
      disabled={!editable}
      {types}
      onselect={id => (selected = selected === id ? null : id)}
      onplace={place}
      onmove={move}
      onmerge={merge}
      onsave={(stackId, name, featureType) =>
        action(async () => {
          await updateResearchStack({
            ...currentSessionVersion(),
            stackId,
            name,
            featureType,
          })
          await refresh()
        })}
    />
    {#if message}
      <p
        role="alert"
        class="bg-base-100 absolute top-3 left-3 z-30 max-w-lg rounded-xl p-3 shadow-lg"
      >
        {message}
      </p>
    {/if}
  </div>
{:else}
  <div
    class={`flex min-h-full flex-1 flex-col pb-6 ${session || creating ? 'p-6' : ''}`}
  >
    {#if session || creating}
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <Heading level={4}
            >{session
              ? 'Field research'
              : creating
                ? 'Batch Image Upload'
                : 'Field research'}</Heading
          >
          <Subheading level={4}
            >{creating || session
              ? 'Upload images, group them on the map, and create Features when ready.'
              : 'Open a previous session or start a new field research.'}</Subheading
          >
        </div>
      </div>
    {/if}

    {#if message}
      <p role="alert" class="bg-error/10 text-error mb-4 rounded-lg p-3 text-sm">
        {message}
        <button type="button" class="underline" onclick={() => action(refresh)}>
          Refresh session
        </button>
      </p>
    {/if}

    {#if !session && !creating}
      {#if sessions.length}
        <section class="shrink-0 px-6" aria-label="Research sessions">
          <div class="mt-3 space-y-2">
            {#each sessions as value, index (value.id)}
              <ResearchSessionRow
                session={value}
                {index}
                disabled={busy}
                selected={selectedSessions.some(item => item.id === value.id)}
                onopen={() =>
                  bulkMode ? toggleSessionSelection(value) : action(() => open(value))}
              />
            {/each}
          </div>
          {#if hasMoreSessions}
            <Button
              text="Load more sessions"
              disabled={busy || indexLoading}
              onClick={() =>
                action(async () => {
                  const request = indexRequest
                  const more = await getResearchSessions({
                    before: sessions[sessions.length - 1].id,
                    ...request,
                  })
                  if (request !== indexRequest) return
                  sessions.push(...more)
                  hasMoreSessions = more.length === 50
                })}
            />
          {/if}
        </section>
      {/if}
      {#if !sessions.length}
        <p class="text-muted-foreground py-8">
          {indexLoading
            ? 'Loading research sessions…'
            : sessionQuery ||
                indexFilters.archive !== 'active' ||
                Boolean(
                  indexFilters.creatorId ||
                    indexFilters.organisationId ||
                    indexFilters.projectId ||
                    indexFilters.layerId,
                )
              ? 'No matching research sessions.'
              : 'No research sessions yet. Press New to start one.'}
        </p>
      {/if}
    {:else if !session}
      <section class="mb-6 min-w-0 shrink-0" aria-label="Layer selection">
        <label class="flex flex-col gap-2 text-sm font-medium">
          Which layer is this research for?
          <input
            type="search"
            bind:value={projectQuery}
            class="bg-panel text-base-content border-border focus-visible:outline-primary w-full min-w-0 rounded-lg border p-3"
            placeholder="Search layers or projects"
          >
        </label>
        <p class="text-muted-foreground mt-4 text-xs font-medium tracking-wide">
          {projectQuery ? 'Matching layers' : 'Suggested layers'}
        </p>
        <section
          class="[&::-webkit-scrollbar-thumb]:bg-primary/50 [&::-webkit-scrollbar-track]:bg-base-100/30 mt-3 flex [scrollbar-width:thin] gap-3 overflow-x-scroll pb-3 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full"
          aria-label="Suggested layers"
        >
          {#each suggestedDestinations as destination (destination.id)}
            <button
              type="button"
              class="bg-panel border-border hover:border-primary focus-visible:ring-primary/50 hover:bg-base-200 flex min-h-40 w-56 shrink-0 flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              aria-pressed={destination.id === layerId}
              class:ring-inset={destination.id === layerId}
              class:ring-1={destination.id === layerId}
              class:ring-primary={destination.id === layerId}
              onclick={() => {
                projectId = destination.projectId
                layerId = destination.id
              }}
            >
              <span class="flex w-full items-center justify-between">
                {#if destination.organisationImage}
                  <img
                    src={getURLfromImage({
                      image: destination.organisationImage,
                      transformation: 'c_fit,h_80,w_80',
                    })}
                    alt=""
                    class="size-10 shrink-0 rounded-lg object-contain"
                  >
                {:else}
                  <OrganisationIcon
                    class="text-primary bg-primary/10 size-10 shrink-0 rounded-lg p-2"
                  />
                {/if}
                {#if destination.id === layerId}
                  <CheckIcon class="text-primary size-5" />
                {/if}
              </span>
              <span class="text-primary text-xs break-words whitespace-normal"
                >{destination.projectName}</span
              >
              <span class="mt-auto font-semibold break-words whitespace-normal"
                >{destination.name}</span
              >
            </button>
          {:else}
            <p class="text-muted-foreground py-4 text-sm">No matching layers.</p>
          {/each}
        </section>
      </section>
      <div class="mb-6 flex shrink-0 flex-wrap items-end gap-4">
        <label class="flex min-w-64 flex-1 flex-col gap-2 text-lg font-semibold"
          >Session<input
            value={name}
            oninput={event => (name = event.currentTarget.value)}
            class={`${controls} min-h-14 px-4 text-lg font-normal`}
            maxlength="200"
          ></label
        >
        <Button
          text="Start session"
          disabled={!projectId || !layerId || !name.trim() || busy}
          onClick={() =>
            action(async () => {
              const value = await createResearchSession({
                id: crypto.randomUUID(),
                name,
                projectId,
                layerId,
              })
              await open(value, true)
              await uploadPending()
            })}
        />
      </div>
      <ImportPrimitive.Dropzone
        type="images"
        spacious
        fill
        title="Drop your research photos here"
        subtitle={queue.length
          ? `${queue.length} images queued · Choose a project and start the session to upload`
          : 'Click to choose images, or drag them here. Upload begins when you start the session.'}
        icon={CloudArrowUp}
        accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT}
        multiple
        disabled={busy}
        ondrop={addFiles}
        onselect={addFiles}
      />
    {:else}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <input
          aria-label="Session"
          value={name}
          oninput={event => (name = event.currentTarget.value)}
          class={`${controls} min-w-64 flex-1`}
          maxlength="200"
        >
        <Button
          text="Save name"
          size="sm"
          style="ghost"
          disabled={!editable || !name.trim()}
          onClick={() =>
            action(async () => {
              await updateResearchSession({
                ...currentSessionVersion(),
                name,
                completed: false,
              })
              await refresh()
            })}
        />
        <span class="text-sm opacity-70"
          >{images.filter(image => image.state === 'uploaded').length}
          images · {stacks.length} stacks</span
        >
        <Button
          text="Sessions"
          size="sm"
          style="ghost"
          disabled={uploading || busy || failed > 0}
          onClick={() =>
            action(async () => {
              sessions = await refreshRemoteQuery(getResearchSessions({}))
              hasMoreSessions = sessions.length === 50
              session = null
              creating = false
            })}
        />
      </div>
      {#if !session.layerId}
        <label class="mb-4 flex flex-col gap-2 text-sm"
          >Layer
          <select
            aria-label="Session layer"
            bind:value={layerId}
            class={controls}
            disabled={busy}
            onchange={() =>
              action(async () => {
                await configureResearchLayer({ ...currentSessionVersion(), layerId })
                await refresh()
              })}
          >
            <option value="">Choose a layer</option>
            {#each layers as layer}
              <option value={layer.id}>{layer.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if session.status !== 'completed'}
        <ImportPrimitive.Dropzone
          type="images"
          spacious
          fill={images.length === 0}
          title="Drop your research photos here"
          subtitle="Click to choose images, or drag them here. Images stay provisional until you create a Feature."
          icon={CloudArrowUp}
          accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT}
          multiple
          disabled={uploading || busy}
          isUploading={uploading}
          uploadProgress={`${completed} of ${queue.length} uploaded · ${failed} failed`}
          ondrop={addFiles}
          onselect={addFiles}
        />
      {/if}
      {#if queue.length}
        <div class="my-4 space-y-2" aria-live="polite">
          <p class="text-sm">
            {completed}
            / {queue.length} uploaded{uploading
              ? ' · Uploading two images at a time…'
              : ''}
          </p>
          <progress
            class="accent-primary w-full"
            max={queue.length}
            value={completed}
          ></progress>
          {#each queue.filter(item => item.status === 'uploading') as item}
            <p class="text-sm opacity-70">Uploading {item.name}</p>
          {/each}
          {#if failed}
            <Button
              text={`Retry ${failed} failed uploads`}
              disabled={uploading || busy}
              onClick={() => void uploadPending()}
            />
            <ul class="text-error max-h-40 overflow-auto text-sm">
              {#each queue.filter(item => item.status === 'failed') as item}
                <li>{item.name}: {item.error}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
      {#if !uploading && images.some(image => image.state === 'uploading')}
        <p class="text-warning my-4 text-sm">
          Some uploads were interrupted. Select those original files again to resume
          them in this session.
        </p>
      {/if}
      {#if images.some(image => !image.stackId && image.state === 'uploaded') &&
        !uploading}
        <Button
          text="Group uploaded images by location"
          disabled={!editable}
          onClick={() =>
            action(async () => {
              await clusterResearchSession({
                ...currentSessionVersion(),
              })
              await refresh()
            })}
        />
      {/if}
    {/if}
  </div>
{/if}
