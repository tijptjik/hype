<script lang="ts">
// SVELTE
import { refreshRemoteQuery } from '#lib/remote/index.js'
import { page } from '$app/state'
import { goto } from '$app/navigation'
// ADAPTERS
import { useImageProviderModel } from '#lib/adapters/image/index.js'
// BITS
import FeatureIdentityDialog from '#lib/bits/patterns/revisionHistory/FeatureIdentityDialog.svelte'
import { TaskEditor } from '#lib/bits/index.js'
import { locationTaskLabel } from '#lib/locations/tasks.js'
import type {
  HeaderButtonActionConfig,
  HeaderCrumb,
} from '#lib/bits/patterns/layout/header/index.js'
import type { TaskReviewUiAction } from '#lib/bits/patterns/tasks/index.js'
import {
  TaskInfoDialog,
  TaskRejectDialog,
  TaskReviewStatusBar,
} from '#lib/bits/patterns/tasks/components/index.js'
import TaskLocaleActions from '#lib/bits/patterns/tasks/components/TaskLocaleActions.svelte'
import {
  restoreProfileLocales,
  type ProfileLocaleState,
} from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// CLIENT SERVICES
import {
  getEffectiveTaskLayerId,
  getSelectedTaskLayer,
  getTaskReviewActionToastLabel,
  getTaskSyncSignature,
  mergeResolvedTaskFeature,
  syncAssignedTaskLayerCache,
} from '#lib/client/services/task.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  ImageContextResourceExtended,
  ResourcePath,
} from '#lib/enums.js'
import { featureCreationPreview } from '#lib/revisions/featureCreationPreview.js'
// I18N
import { getI18n, getLocaleKey, m } from '#lib/i18n.js'
import { toast } from 'svelte-sonner'
// ICONS
import CheckBadgeIcon from 'virtual:icons/proicons/checkmark-starburst'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import DuplicateIcon from 'virtual:icons/lucide/circle-equal'
import EyeOffIcon from 'virtual:icons/proicons/eye-off'
import GhostIcon from 'virtual:icons/lucide/ghost'
import InfoIcon from 'virtual:icons/proicons/info'
import TaskIcon from 'virtual:icons/proicons/archive'
import TrashIcon from 'virtual:icons/proicons/delete'
import XCircleIcon from 'virtual:icons/proicons/cancel-circle'
// NAVIGATION
import { goToNextTask, navigateOnAdmin } from '#lib/navigation/index.js'
// PROVIDERS
import ImageProvider from '#lib/providers/ImageProvider.svelte'
// REMOTE
import { getTask, reassignTaskLayer, reviewTask } from '#lib/api/tasks.remote.js'
// TYPES
import type { RemoteQuery } from '$app/server'
import type { Id } from '#lib/types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { TaskType } from '#lib/api/services/taskReview.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. STATE AND DATA LOADING
// - getEditorRequest
//
// 1. TASK HEADER HELPERS
// - getActionButtons
// - openRejectDialog
// - createReviewTaskAction
// - getTaskActionButtons
// - getTaskBreadcrumbs
// - showReviewToast
//
// 2. TASK EFFECTS
//
// 3. TASK MUTATIONS
// - handleReview
// - handleConfirmReject
// - handleReassignLayer
//
// 4. IMAGE PROVIDER STATE
// ---
/********************
 *  0. STATE AND DATA LOADING
 ************/
// +++ State And Data Loading

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

const typeDisplay: Record<TaskType, string> = {
  reportedMissing: m.noble_zany_crow_dance(),
  newPhoto: m.aware_sea_goose_nail(),
  newFeature: m.smart_crazy_cuckoo_play(),
  locationFacts: locationTaskLabel('locationFacts'),
  locationPosition: locationTaskLabel('locationPosition'),
  locationIdentity: locationTaskLabel('locationIdentity'),
  locationMerge: locationTaskLabel('locationMerge'),
}

let locationActions = $state<{
  taskId: string
  actions: HeaderButtonActionConfig[]
} | null>(null)
let isInfoOpen = $state(false)
let isRejectDialogOpen = $state(false)
let reviewReason = $state('')
let pendingRejectAction = $state<TaskReviewUiAction | null>(null)
let isReviewBusy = $state(false)
let duplicateOpen = $state(false)
let reviewDialogTrigger = $state<HTMLElement | null>(null)
let isLayerBusy = $state(false)
let taskState = $state<Task | null>(null)
let lastSyncedTaskSignature = $state('')

/**
 * Fetches the task editor payload for the current admin route.
 * @returns Remote query request for the current task editor state
 */
function getEditorRequest(): RemoteQuery<{ data: Task | null }> {
  return getTask({
    id: page.params.task ?? '',
    meta: {
      ...adminCtx.view.resources.queryMeta,
      profile: 'admin',
    },
  }) as RemoteQuery<{ data: Task | null }>
}

// Observe the native query without suspending navigation on the editor round trip.
const editorRequest = $derived(getEditorRequest())
const editorResult = $derived(editorRequest.current)
const task = $derived(
  editorResult?.data?.id === page.params.task
    ? taskState?.id === page.params.task
      ? taskState
      : (editorResult?.data ?? null)
    : null,
)
// Queue data supplies presentation only; actions require the fresh editor response.
const queuedTask = $derived(
  adminCtx.view.cache.task.get(page.params.task ?? '') as Task | undefined,
)
let localeSelection = $state<{ taskId: string; state: ProfileLocaleState } | null>(null)
const localePreview = $derived(
  task?.creationProposal
    ? featureCreationPreview(task.creationProposal.content)
    : task?.feature,
)
const localeState = $derived(
  localeSelection && localeSelection.taskId === task?.id
    ? localeSelection.state
    : restoreProfileLocales(
        [canonicalContentTag(getLocaleKey())],
        localePreview?.i18n ?? {},
      ),
)
/** Update the current task's visible translations.
 * @param state Header locale selection.
 * @returns Nothing.
 */
function updateTaskLocales(state: ProfileLocaleState): void {
  if (task) localeSelection = { taskId: task.id, state }
}

const assignableLayers = $derived(editorResult?.data?.assignableLayers ?? [])
const canReassignLayer = $derived(editorResult?.data?.canReassignLayer ?? false)
const taskTitle = $derived(task ? typeDisplay[task.type as TaskType] : '')
const resolvedFeature = $derived.by((): Feature | null =>
  task
    ? (mergeResolvedTaskFeature(
        task as Pick<Task, 'featureId' | 'feature'>,
        adminCtx.view.cache.feature as Map<Id, Feature>,
      ) as Feature | null)
    : null,
)
const effectiveLayerId = $derived(
  task ? getEffectiveTaskLayerId(task, resolvedFeature) : null,
)
const taskSyncSignature = $derived(
  task ? getTaskSyncSignature(task, effectiveLayerId) : '',
)

// Clone the remote task into local state so review and reassignment updates stay editable.
$effect(() => {
  taskState = editorResult?.data ? (structuredClone(editorResult.data) as Task) : null
})

// Keep the admin caches and current facet aligned with the latest task state.
$effect(() => {
  if (!task?.id) return

  if (lastSyncedTaskSignature !== taskSyncSignature) {
    adminCtx.view.setTaskResourceAndCache(task)
    lastSyncedTaskSignature = taskSyncSignature
  }

  if (effectiveLayerId) {
    syncAssignedTaskLayerCache({
      layerId: effectiveLayerId,
      assignableLayers,
      task,
      layerCache: adminCtx.view.cache.layer,
    })
  }

  adminCtx.setFacet('core', task.id, FirstClassResource.task)
})

// ---
/********************
 *  1. TASK HEADER HELPERS
 ************/
// +++ Task Header Helpers

/**
 * Builds the persistent view action buttons for the task header.
 * @returns Header action button configuration
 */
function getActionButtons(): HeaderButtonActionConfig[] {
  if (task?.locationTask) return []
  return [
    {
      text: 'Info',
      icon: InfoIcon,
      onClick: () => {
        isInfoOpen = true
      },
      class: 'min-w-0 p-0 pr-2',
      style: 'ghost',
      color: 'neutral',
      alwaysHideLabel: true,
      attrs: {
        'aria-label': 'Open task information',
      },
    },
  ]
}

/**
 * Opens the reject dialog and primes the reject action state.
 */
function openRejectDialog(): void {
  pendingRejectAction = 'reject'
  reviewReason = ''
  isRejectDialogOpen = true
}

/** Open duplicate resolution only after the latest thumbnail order is saved.
 * @returns Completion after the order settles or the action is cancelled.
 */
async function openDuplicateDialog(): Promise<void> {
  const requestedTask = task?.id
  if (!requestedTask) return
  if (imageOrderWait?.taskId === requestedTask && !(await imageOrderWait.wait())) return
  if (
    task?.id === requestedTask &&
    !task.isReviewed &&
    !isReviewBusy &&
    !isLayerBusy &&
    !imageReviewBusy
  )
    duplicateOpen = true
}

/**
 * Creates a task review header action button with shared busy and style settings.
 * @param config - Text, icon, review action, and button styling details
 * @returns Header button config wired to the requested review action
 */
function createReviewTaskAction(config: {
  text: string
  icon: HeaderButtonActionConfig['icon']
  action?: TaskReviewUiAction
  onClick?: () => void
  color: NonNullable<HeaderButtonActionConfig['color']>
  disabled?: boolean
}): HeaderButtonActionConfig {
  return {
    attrs: {
      onpointerdown: (event: PointerEvent) => {
        reviewDialogTrigger = event.currentTarget as HTMLElement
      },
      onkeydown: (event: KeyboardEvent) => {
        reviewDialogTrigger = event.currentTarget as HTMLElement
      },
    },
    text: config.text,
    icon: config.icon,
    onClick:
      config.onClick ??
      (() => {
        if (!config.action) return
        void handleReview(config.action)
      }),
    disabled: config.disabled || isReviewBusy || isLayerBusy || imageReviewBusy,
    color: config.color,
    style: 'ghost',
  }
}

/**
 * Builds the task-specific review actions shown in the header.
 * @returns Header review action buttons for the current task type
 */
function getTaskActionButtons(): HeaderButtonActionConfig[] {
  if (task?.locationTask)
    return locationActions?.taskId === task.id ? locationActions.actions : []
  if (!task) {
    return []
  }

  if (task.isReviewed) {
    return []
  }

  const common = [
    createReviewTaskAction({
      text: m.alive_north_albatross_lead(),
      icon: XCircleIcon,
      onClick: openRejectDialog,
      color: 'error',
    }),
  ]

  if (task.type === 'newFeature') {
    return [
      ...common,
      createReviewTaskAction({
        text: m.task_resolve_duplicate_label(),
        icon: DuplicateIcon,
        color: 'warning',
        onClick: () => {
          void openDuplicateDialog()
        },
      }),
      createReviewTaskAction({
        text: 'Accept',
        icon: CheckIcon,
        action: 'accept',
        color: 'success',
      }),
    ]
  }

  if (task.type === 'newPhoto') {
    if (task.revisionReviewRequired)
      return [
        ...common,
        ...(['acceptAll', 'acceptClassified'] as const).map(mode =>
          createReviewTaskAction({
            text:
              mode === 'acceptAll'
                ? m.each_funny_cow_radiate()
                : m.shy_sunny_hare_revive(),
            icon: mode === 'acceptAll' ? CheckIcon : CheckBadgeIcon,
            color: 'success',
            disabled:
              imageAcceptAction?.taskId !== task.id ||
              (imageAcceptAction?.disabled ?? true),
            onClick: () => {
              if (imageAcceptAction && imageAcceptAction.taskId === task?.id)
                void imageAcceptAction.accept(mode)
            },
          }),
        ),
      ]
    return [
      ...common,
      createReviewTaskAction({
        text: m.each_funny_cow_radiate(),
        icon: CheckIcon,
        action: 'acceptAll',
        disabled: !task.images?.length,
        color: 'success',
      }),
      createReviewTaskAction({
        text: m.shy_sunny_hare_revive(),
        icon: CheckBadgeIcon,
        action: 'acceptClassified',
        disabled: !task.images?.length,
        color: 'success',
      }),
    ]
  }

  return [
    ...common,
    createReviewTaskAction({
      text: m.task_mark_permanently_unavailable(),
      icon: GhostIcon,
      action: 'setIntangible',
      color: 'accent',
    }),
    createReviewTaskAction({
      text: m.forms__unpublish(),
      icon: EyeOffIcon,
      action: 'setUnpublished',
      color: 'warning',
    }),
    createReviewTaskAction({
      text: m.whole_deft_penguin_enchant(),
      icon: TrashIcon,
      action: 'setArchived',
      color: 'error',
    }),
  ]
}

/**
 * Builds the task breadcrumb trail from the current hierarchy context.
 * @param subject Task whose known hierarchy should be shown, including queue previews.
 * @returns Ordered admin breadcrumb list for the current task
 */
function getTaskBreadcrumbs(subject: Task | null = task): HeaderCrumb[] {
  const task = subject
  if (!task) {
    return []
  }

  const breadcrumbFeature = mergeResolvedTaskFeature(
    task,
    adminCtx.view.cache.feature as Map<Id, Feature>,
  ) as Feature | null
  const breadcrumbLayerId = getEffectiveTaskLayerId(task, breadcrumbFeature)
  const preferences = adminCtx.view.getUserPreferences()
  const selectedLayer = getSelectedTaskLayer(
    assignableLayers,
    breadcrumbLayerId,
    adminCtx.view.cache.layer,
  )
  const organisationName =
    getI18n(task.organisation as never, 'nameShort', preferences) ||
    getI18n(task.organisation as never, 'name', preferences) ||
    ''
  const projectName =
    getI18n(task.project as never, 'nameShort', preferences) ||
    getI18n(task.project as never, 'name', preferences) ||
    ''
  const featureTitle =
    (breadcrumbFeature
      ? getI18n(breadcrumbFeature as never, 'title', preferences)
      : undefined) ||
    getI18n(
      (task.creationProposal
        ? featureCreationPreview(task.creationProposal.content)
        : task.feature) as never,
      'title',
      preferences,
    ) ||
    ''
  const featureId = breadcrumbFeature?.id ?? task.featureId ?? null
  const layerName =
    (selectedLayer && 'projectId' in selectedLayer
      ? getI18n(selectedLayer, 'nameShort', preferences) ||
        getI18n(selectedLayer, 'name', preferences)
      : null) ||
    (selectedLayer && 'id' in selectedLayer && 'projectId' in selectedLayer
      ? adminCtx.view.getContextualLayerName(selectedLayer as Layer, false, false)
      : null) ||
    (selectedLayer && 'code' in selectedLayer ? selectedLayer.code : null) ||
    ''
  const crumbs: HeaderCrumb[] = []

  if (organisationName && task.organisation?.code) {
    crumbs.push({
      name: organisationName,
      href: `/admin/${ResourcePath[FirstClassResource.organisation]}/${task.organisation.code}`,
    })
  }

  if (projectName && task.project?.code) {
    crumbs.push({
      name: projectName,
      href: `/admin/${ResourcePath[FirstClassResource.project]}/${task.project.code}`,
    })
  }

  if (layerName && breadcrumbLayerId) {
    crumbs.push({
      name: layerName,
      href: `/admin/${ResourcePath[FirstClassResource.layer]}/${breadcrumbLayerId}`,
    })
  }

  // Pending creation tasks describe proposals, including legacy provisional Features.
  if (featureTitle && featureId && !(task.type === 'newFeature' && !task.isReviewed)) {
    crumbs.push({
      name: featureTitle,
      href: `/admin/${ResourcePath[FirstClassResource.feature]}/${featureId}`,
    })
  }

  return crumbs
}

/**
 * Shows the review success toast for the completed action.
 * @param action - Review action that completed successfully
 */
function showReviewToast(action: TaskReviewUiAction): void {
  if (!task) return

  const featureTitle =
    getI18n(
      (task.creationProposal
        ? featureCreationPreview(task.creationProposal.content)
        : task.feature) as never,
      'title',
      adminCtx.view.getUserPreferences(),
    ) ?? task.id

  toast.success(`${featureTitle} ${getTaskReviewActionToastLabel(action)}`)
}

// ---
/********************
 *  2. TASK EFFECTS
 ************/
// +++ Task Effects

// Rebuild the admin header whenever task state or review metadata changes.
$effect(() => {
  if (!task?.id) {
    headerCtrl.setHeaderForEntity(
      queuedTask ? typeDisplay[queuedTask.type as TaskType] : m.navbar__tasks(),
      TaskIcon,
      new Map(),
    )
    headerCtrl.setCrumbs(getTaskBreadcrumbs(queuedTask ?? null))
    headerCtrl.state.visibility = {
      showNew: false,
      showFilter: false,
      showFacets: false,
      showViewActions: false,
      showFormActions: false,
    }
    headerCtrl.setViewActions([])
    headerCtrl.setTaskActions([])
    headerCtrl.setTaskActionContent(null, {})
    headerCtrl.clearControlBar()
    headerCtrl.clearFooter()
    return
  }

  headerCtrl.setHeaderForEntity(taskTitle, TaskIcon, new Map())
  headerCtrl.setCrumbs(getTaskBreadcrumbs())
  headerCtrl.setViewActions(getActionButtons())
  headerCtrl.setTaskActions(getTaskActionButtons())

  if (task.type === 'newFeature') {
    headerCtrl.setTaskActionContent(TaskLocaleActions, {
      localeState,
      content: localePreview?.i18n ?? {},
      onChange: updateTaskLocales,
      review: task.isReviewed
        ? {
            reviewerId: task.reviewer?.id ?? null,
            reviewedAt: task.modifiedAt ?? task.createdAt ?? null,
            reviewOutcome: task.reviewOutcome ?? null,
            reviewAction: task.reviewAction ?? null,
            reviewReason: task.reviewReason ?? null,
          }
        : undefined,
    })
  } else if (task.isReviewed) {
    headerCtrl.setTaskActionContent(TaskReviewStatusBar, {
      reviewerId: task.reviewer?.id ?? null,
      reviewedAt: task.modifiedAt ?? task.createdAt ?? null,
      reviewOutcome: task.reviewOutcome ?? null,
      reviewAction: task.reviewAction ?? null,
      reviewReason: task.reviewReason ?? null,
    })
  } else {
    headerCtrl.setTaskActionContent(null, {})
  }

  headerCtrl.clearControlBar()
  headerCtrl.state.visibility = {
    showNew: false,
    showFilter: false,
    showFacets: false,
    showViewActions: true,
    showFormActions: false,
  }
})

// ---
/********************
 *  3. TASK MUTATIONS
 ************/
// +++ Task Mutations

let imageReview = $state<{
  taskId: string
  reviewId: string | null
  proposalVersion: string
}>()
let imageReviewBusy = $state(false)
let imageAcceptAction = $state<{
  taskId: string
  disabled: boolean
  accept: (mode?: 'acceptAll' | 'acceptClassified') => Promise<void>
}>()

/**
 * Reviews the current task and handles the resulting navigation flow.
 * @param action - Review action to submit
 * @param explicitReviewReason - Optional review reason for rejected tasks
 * @returns Whether the review completed successfully
 */
let imageReview = $state<{
  taskId: string
  reviewId: string | null
  proposalVersion: string
}>()
let imageReviewBusy = $state(false)
let imageOrderWait = $state<{ taskId: string; wait: () => Promise<boolean> }>()
let imageAcceptAction = $state<{
  taskId: string
  disabled: boolean
  accept: (mode?: 'acceptAll' | 'acceptClassified') => Promise<void>
}>()

async function handleReview(
  action: TaskReviewUiAction,
  explicitReviewReason?: string,
): Promise<boolean> {
  if (!task?.id || task.isReviewed || isReviewBusy || isLayerBusy || imageReviewBusy)
    return false

  const requestedTask = task.id
  isReviewBusy = true

  try {
    if (imageOrderWait?.taskId === requestedTask && !(await imageOrderWait.wait()))
      return false
    if (task?.id !== requestedTask || imageReviewBusy || isLayerBusy) return false
    // Refresh the editor query too so Back cannot restore its pre-review task snapshot.
    const result = await reviewTask({
      id: task.id,
      imageReview,
      action,
      reviewReason: explicitReviewReason,
      meta: {
        isAdminRequest: true,
      },
    }).updates(getEditorRequest())

    // Apply the reviewed task immediately so cache, toast, and navigation use the same snapshot.
    const updatedTask = structuredClone(result.data)
    if (!updatedTask) return false

    taskState = updatedTask
    adminCtx.view.setTaskResourceAndCache(updatedTask)
    showReviewToast(action)

    if (action === 'accept' && updatedTask.featureId) {
      adminCtx.invalidateAndRefresh(FirstClassResource.task)
      navigateOnAdmin(
        adminCtx,
        FirstClassResource.feature,
        updatedTask.featureId,
        'core',
      )
      return true
    }

    goToNextTask(adminCtx)
    return true
  } catch (error) {
    console.error('Failed to review task:', error)
    toast.error('Failed to review task')
    return false
  } finally {
    isReviewBusy = false
  }
}

/**
 * Confirms the pending reject action with the current reject reason.
 */
async function handleConfirmReject(): Promise<void> {
  if (!pendingRejectAction) return

  const action = pendingRejectAction
  // Preserve the reason and dialog when a review fails so the reviewer can retry.
  const completed = await handleReview(action, reviewReason.trim() || undefined)
  if (completed) {
    pendingRejectAction = null
    isRejectDialogOpen = false
    reviewReason = ''
  }
}

/**
 * Reassigns the task to a different layer and refreshes the editor payload.
 * @param layerId - Newly selected layer ID
 */
async function handleReassignLayer(layerId: string): Promise<void> {
  if (!task?.id || isLayerBusy || isReviewBusy) return

  isLayerBusy = true

  try {
    const result = await reassignTaskLayer({
      id: task.id,
      layerId,
      meta: {
        isAdminRequest: true,
      },
    }).updates(getEditorRequest())

    // Persist the reassigned task snapshot and mirror the layer into shared cache state.
    const updatedTask = structuredClone(result.data)
    if (!updatedTask) return

    taskState = updatedTask
    syncAssignedTaskLayerCache({
      layerId,
      assignableLayers,
      task: updatedTask,
      layerCache: adminCtx.view.cache.layer,
    })
    adminCtx.view.setTaskResourceAndCache(updatedTask)
  } catch (error) {
    console.error('Failed to reassign task layer:', error)
    toast.error('Failed to reassign layer')
  } finally {
    isLayerBusy = false
  }
}

// ---
/********************
 *  4. IMAGE PROVIDER STATE
 ************/
// +++ Image Provider State

const imageProviderProps = $derived.by(() => {
  const isValid = task?.id === page.params.task && !task?.locationTask
  const hierarchySource = resolvedFeature ?? task

  return {
    isAdminMode: true,
    isValid,
    image: isValid
      ? ((task?.images?.[0] as ImageCtxEnvelope | undefined) ?? undefined)
      : undefined,
    images: isValid
      ? ((task?.images as ImageCtxEnvelope[] | undefined) ?? undefined)
      : undefined,
    highlightedIds: task?.images?.map(taskImage => taskImage.imageId as Id) ?? [],
    ...(hierarchySource
      ? adminCtx.view.getHierarchySync(hierarchySource as Feature | Task)
      : {}),
    context:
      isValid && task?.featureId
        ? {
            ctxType: ImageContextResource.feature,
            ctxId: task.featureId as Id,
            ctxTypeSecondary: ImageContextResourceExtended.task,
            ctxIdSecondary: task.id,
          }
        : isValid && task?.creationProposal
          ? {
              ctxTypeSecondary: ImageContextResourceExtended.task,
              ctxIdSecondary: task.id,
            }
          : undefined,
  }
})

const imageProviderModel = useImageProviderModel(
  () => page,
  () => imageProviderProps,
)
</script>

{#if task && (task.featureId || task.creationProposal) && effectiveLayerId}
  <FeatureIdentityDialog
    bind:open={duplicateOpen}
    duplicateChoice
    source={reviewDialogTrigger}
    onDiscard={() => handleReview('reject', 'Duplicate contribution discarded')}
    kind="merge"
    featureId={task.featureId ?? ''}
    creationProposal={Boolean(task.creationProposal && !task.featureId)}
    layerId={effectiveLayerId}
    sourceGeometry={task.creationProposal?.content.placement.geometry ??
      task.feature?.geometry}
    duplicateTaskId={task.id}
    onApplied={async ids => {
      await adminCtx.invalidateAndRefresh(FirstClassResource.task)
      await goto(`/admin/features/${encodeURIComponent(ids[0])}`)
    }}
  />
{/if}

{#if task && !task.locationTask}
  <TaskInfoDialog bind:open={isInfoOpen} type={task.type as TaskType} revisionReviewRequired={task.revisionReviewRequired} />
{/if}
<TaskRejectDialog
  bind:open={isRejectDialogOpen}
  source={reviewDialogTrigger}
  bind:value={reviewReason}
  isBusy={isReviewBusy || imageReviewBusy}
  onConfirm={handleConfirmReject}
/>

{#if editorRequest.error}
  <div role="alert" class="p-6">
    <span>{m.resource_action_failed()}</span>
    <button
      type="button"
      class="ml-3 underline"
      onclick={() => void editorRequest.refresh().catch(() => {})}
    >
      {m.bootstrap__retry()}
    </button>
  </div>
{:else if editorRequest.ready && !task}
  <div role="status" class="p-6">{m.resource_action_failed()}</div>
{/if}

<ImageProvider model={imageProviderModel}>
  {#if !editorRequest.error && (!editorRequest.ready || task)}
    <TaskEditor
      previewTask={queuedTask ?? null}
      loading={!editorRequest.ready}
      onLocationActionsChange={actions => {
        if (task) locationActions = { taskId: task.id, actions }
      }}
      onLocationCommitted={async () => {
        await adminCtx.invalidateAndRefresh(FirstClassResource.task)
        navigateOnAdmin(adminCtx, FirstClassResource.task)
      }}
      onImageAcceptActionChange={action => (imageAcceptAction = action)}
      onImagesAccepted={async () => {
        const fresh = await refreshRemoteQuery(getEditorRequest())
        taskState = structuredClone(fresh.data) as Task | null
        if (taskState?.isReviewed) goToNextTask(adminCtx)
      }}
      onImageReviewChange={(value, busy, waitForOrder) => {
        imageOrderWait = task ? { taskId: task.id, wait: waitForOrder } : undefined
        imageReview = value
        imageReviewBusy = busy
      }}
      {localeState}
      onLocaleStateChange={updateTaskLocales}
      {task}
      {assignableLayers}
      {canReassignLayer}
      isLayerBusy={isLayerBusy || isReviewBusy || imageReviewBusy}
      onReview={async action => {
        await handleReview(action)
      }}
      onReassignLayer={handleReassignLayer}
    />
  {/if}
</ImageProvider>
