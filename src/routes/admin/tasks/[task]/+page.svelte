<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// BITS
import { TaskEditor } from '$lib/bits'
import type {
  HeaderButtonActionConfig,
  HeaderCrumb,
} from '$lib/bits/patterns/layout/header'
import type { TaskReviewUiAction } from '$lib/bits/patterns/tasks'
import {
  TaskInfoDialog,
  TaskRejectDialog,
  TaskReviewStatusBar,
} from '$lib/bits/patterns/tasks/components'
// CLIENT SERVICES
import {
  getEffectiveTaskLayerId,
  getSelectedTaskLayer,
  getTaskReviewActionToastLabel,
  getTaskSyncSignature,
  mergeResolvedTaskFeature,
  syncAssignedTaskLayerCache,
} from '$lib/client/services/task'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  ImageContextResourceExtended,
  ResourcePath,
} from '$lib/enums'
// I18N
import { getI18n, m } from '$lib/i18n'
import { toast } from 'svelte-sonner'
// ICONS
import CheckBadgeIcon from 'virtual:icons/lucide/badge-check'
import CheckIcon from 'virtual:icons/lucide/circle-check'
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import GhostIcon from 'virtual:icons/lucide/ghost'
import InfoIcon from 'virtual:icons/lucide/info'
import TaskIcon from 'virtual:icons/lucide/inbox'
import TrashIcon from 'virtual:icons/lucide/trash-2'
import XCircleIcon from 'virtual:icons/lucide/circle-x'
// NAVIGATION
import { goToNextTask, navigateOnAdmin } from '$lib/navigation'
// PROVIDERS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
// REMOTE
import { getTask, reassignTaskLayer, reviewTask } from '$lib/api/server/tasks.remote'
// TYPES
import type { Id, Task, TaskType } from '$lib/types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'

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
}

let isInfoOpen = $state(false)
let isRejectDialogOpen = $state(false)
let reviewReason = $state('')
let pendingRejectAction = $state<TaskReviewUiAction | null>(null)
let isReviewBusy = $state(false)
let isLayerBusy = $state(false)
let taskState = $state<Task | null>(null)
let lastSyncedTaskSignature = $state('')

/**
 * Fetches the task editor payload for the current admin route.
 * @returns Remote query request for the current task editor state
 */
function getEditorRequest() {
  return getTask({
    id: page.params.task ?? '',
    meta: {
      isAdminRequest: true,
      profile: 'admin',
    },
  })
}

const editorResult = $derived(await getEditorRequest()) as { data: Task | null }
const task = $derived(taskState ?? editorResult.data) as Task | null
const assignableLayers = $derived(editorResult.data?.assignableLayers ?? [])
const canReassignLayer = $derived(editorResult.data?.canReassignLayer ?? false)
const taskTitle = $derived(task ? typeDisplay[task.type as TaskType] : '')
const resolvedFeature = $derived.by((): Feature | null =>
  task
    ? (mergeResolvedTaskFeature(
        task as Pick<Task, 'featureId' | 'feature'>,
        adminCtx.appCtx.cache.feature as Map<Id, Feature>,
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
  taskState = structuredClone(editorResult.data) as Task | null
})

// Keep the admin caches and current facet aligned with the latest task state.
$effect(() => {
  if (!task?.id) return

  if (lastSyncedTaskSignature !== taskSyncSignature) {
    adminCtx.appCtx.setTaskResourceAndCache(task)
    lastSyncedTaskSignature = taskSyncSignature
  }

  if (effectiveLayerId) {
    syncAssignedTaskLayerCache({
      layerId: effectiveLayerId,
      assignableLayers,
      task,
      layerCache: adminCtx.appCtx.cache.layer,
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
}): HeaderButtonActionConfig {
  return {
    text: config.text,
    icon: config.icon,
    onClick:
      config.onClick ??
      (() => {
        if (!config.action) return
        void handleReview(config.action)
      }),
    disabled: isReviewBusy,
    color: config.color,
    style: 'ghost',
  }
}

/**
 * Builds the task-specific review actions shown in the header.
 * @returns Header review action buttons for the current task type
 */
function getTaskActionButtons(): HeaderButtonActionConfig[] {
  if (!task) {
    return []
  }

  if (task.isReviewed) {
    return []
  }

  const common = [
    createReviewTaskAction({
      text: m.quiet_late_worm_startle(),
      icon: XCircleIcon,
      onClick: openRejectDialog,
      color: 'error',
    }),
  ]

  if (task.type === 'newFeature') {
    return [
      ...common,
      createReviewTaskAction({
        text: m.quiet_late_worm_startle_accept(),
        icon: CheckIcon,
        action: 'accept',
        color: 'success',
      }),
    ]
  }

  if (task.type === 'newPhoto') {
    return [
      ...common,
      createReviewTaskAction({
        text: m.each_funny_cow_radiate(),
        icon: CheckIcon,
        action: 'acceptAll',
        color: 'success',
      }),
      createReviewTaskAction({
        text: m.shy_sunny_hare_revive(),
        icon: CheckBadgeIcon,
        action: 'acceptClassified',
        color: 'success',
      }),
    ]
  }

  return [
    ...common,
    createReviewTaskAction({
      text: m.awful_this_dingo_glow(),
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
 * @returns Ordered admin breadcrumb list for the current task
 */
function getTaskBreadcrumbs(): HeaderCrumb[] {
  if (!task) {
    return []
  }

  const preferences = adminCtx.appCtx.getUserPreferences()
  const selectedLayer = getSelectedTaskLayer(
    assignableLayers,
    effectiveLayerId,
    adminCtx.appCtx.cache.layer,
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
    (resolvedFeature
      ? getI18n(resolvedFeature as never, 'title', preferences)
      : undefined) ||
    getI18n(task.feature as never, 'title', preferences) ||
    ''
  const featureId = resolvedFeature?.id ?? task.featureId ?? null
  const layerName =
    (selectedLayer && 'projectId' in selectedLayer
      ? getI18n(selectedLayer, 'nameShort', preferences) ||
        getI18n(selectedLayer, 'name', preferences)
      : null) ||
    (selectedLayer && 'id' in selectedLayer && 'projectId' in selectedLayer
      ? adminCtx.appCtx.getContextualLayerName(selectedLayer as Layer, false, false)
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

  if (layerName && effectiveLayerId) {
    crumbs.push({
      name: layerName,
      href: `/admin/${ResourcePath[FirstClassResource.layer]}/${effectiveLayerId}`,
    })
  }

  if (featureTitle && featureId) {
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
    getI18n(task.feature as never, 'title', adminCtx.appCtx.getUserPreferences()) ??
    task.id

  toast.success(`${featureTitle} ${getTaskReviewActionToastLabel(action)}`)
}

// ---
/********************
 *  2. TASK EFFECTS
 ************/
// +++ Task Effects

// Rebuild the admin header whenever task state or review metadata changes.
$effect(() => {
  if (!task?.id) return

  headerCtrl.setHeaderForEntity(taskTitle, TaskIcon, new Map())
  headerCtrl.setCrumbs(getTaskBreadcrumbs())
  headerCtrl.setViewActions(getActionButtons())
  headerCtrl.setTaskActions(getTaskActionButtons())

  if (task.isReviewed) {
    headerCtrl.setTaskActionContent(TaskReviewStatusBar, {
      reviewerId: task.reviewer?.id ?? null,
      reviewedAt: task.modifiedAt ?? task.createdAt ?? null,
      reviewOutcome: task.reviewOutcome ?? null,
      reviewAction: task.reviewAction ?? null,
      reviewReason: task.reviewReason ?? null,
    })
  } else {
    headerCtrl.setTaskActionContent(null)
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

/**
 * Reviews the current task and handles the resulting navigation flow.
 * @param action - Review action to submit
 * @param explicitReviewReason - Optional review reason for rejected tasks
 */
async function handleReview(
  action: TaskReviewUiAction,
  explicitReviewReason?: string,
): Promise<void> {
  if (!task?.id || isReviewBusy) return

  isReviewBusy = true

  try {
    const result = await reviewTask({
      id: task.id,
      action,
      reviewReason: explicitReviewReason,
      meta: {
        isAdminRequest: true,
      },
    })

    // Apply the reviewed task immediately so cache, toast, and navigation use the same snapshot.
    const updatedTask = structuredClone(result.data)
    if (!updatedTask) return

    taskState = updatedTask
    adminCtx.appCtx.setTaskResourceAndCache(updatedTask)
    showReviewToast(action)

    if (action === 'accept' && updatedTask.featureId) {
      adminCtx.invalidateAndRefresh(FirstClassResource.task)
      navigateOnAdmin(adminCtx, FirstClassResource.feature, updatedTask.featureId)
      return
    }

    goToNextTask(adminCtx)
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
  pendingRejectAction = null
  isRejectDialogOpen = false
  await handleReview(action, reviewReason.trim() || undefined)
  reviewReason = ''
}

/**
 * Reassigns the task to a different layer and refreshes the editor payload.
 * @param layerId - Newly selected layer ID
 */
async function handleReassignLayer(layerId: string): Promise<void> {
  if (!task?.id || isLayerBusy) return

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
      layerCache: adminCtx.appCtx.cache.layer,
    })
    adminCtx.appCtx.setTaskResourceAndCache(updatedTask)
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
  const isValid = task?.id === page.params.task
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
      ? adminCtx.appCtx.getHierarchySync(hierarchySource as Feature | Task)
      : {}),
    context:
      isValid && task?.featureId
        ? {
            ctxType: ImageContextResource.feature,
            ctxId: task.featureId as Id,
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

<TaskInfoDialog bind:open={isInfoOpen} type={task.type as TaskType} />
<TaskRejectDialog
  bind:open={isRejectDialogOpen}
  bind:value={reviewReason}
  isBusy={isReviewBusy}
  onConfirm={handleConfirmReject}
/>

<ImageProvider model={imageProviderModel}>
  <TaskEditor
    {task}
    {assignableLayers}
    {canReassignLayer}
    {isLayerBusy}
    onReview={handleReview}
    onReassignLayer={handleReassignLayer}
  />
</ImageProvider>
