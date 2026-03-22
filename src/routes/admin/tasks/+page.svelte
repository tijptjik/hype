<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// SERVICES
import { createToggleFilter } from '$lib/client/services/filters'
// BITS PATTERNS
import { GroupedResourceIndex, ResourceControlBar, TaskRow } from '$lib/bits'
// COMPONENTS
import FullScreenViewer from '$lib/components/modals/FullScreenViewer.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// ICONS
import TaskIcon from 'virtual:icons/lucide/inbox'
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
// TYPES
import type { Id, ResourceControlBarConfig, Task } from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Project } from '$lib/db/zod/schema/project.types'

const filters = {
  resource: FirstClassResource.task,
  sections: [
    {
      key: 'status',
      title: m.filters__status(),
      icon: StatusIcon,
      filters: [
        createToggleFilter('isReviewed', {
          label: m.plain_broad_shell_dart(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
          refreshResource: FirstClassResource.task,
        }),
      ],
    },
  ],
} satisfies ResourceControlBarConfig

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.task)

// ELEMENTS
let listContainer: HTMLElement | null = $state(null)

let selectedImage = $state<ImageCtxEnvelope | null>(null)
let selectedTask = $state<Task | null>(null)
let selectedTaskIndex = $state<number>(-1)

let entities: Task[] = $derived(
  adminCtx.isInitialised
    ? adminCtx.getViewFilteredResource<Task>(FirstClassResource.task)
    : [],
)

// Group tasks by project
let groupedEntities: Array<{ group: Project; entities: Task[] }> = $derived(
  Object.entries(
    entities.reduce(
      (acc, task) => {
        const projectId = task.projectId || 'no-project'
        if (!acc[projectId]) {
          acc[projectId] = []
        }
        acc[projectId].push(task)
        return acc
      },
      {} as Record<Id, Task[]>,
    ),
  )
    .map(([projectId, projectTasks]) => {
      const project = adminCtx.appCtx.getResourceByIdSync(
        FirstClassResource.project,
        projectId,
      ) as Project
      return {
        group: project,
        entities: projectTasks,
      }
    })
    .filter(({ group }) => group != null), // Filter out undefined projects during navigation
)

$effect(() => {
  headerCtrl.setHeaderForIndex(m.navbar__tasks(), TaskIcon, {
    showNew: false,
  })
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.task,
      count: entities.length,
      filters,
    },
    {
      isVisible: adminCtx.appCtx.state.ui.isControlBarVisible[FirstClassResource.task],
    },
  )
  headerCtrl.clearFooter()
})

function navigateToNextTask() {
  if (selectedTaskIndex < 0) return
  // Find the next feature with an image
  for (let i = selectedTaskIndex + 1; i < entities.length; i++) {
    const nextTask = entities[i]
    if (nextTask?.images?.[0]) {
      selectedTask = nextTask
      selectedImage = nextTask.images?.[0] as unknown as ImageCtxEnvelope
      selectedTaskIndex = i
      updateRowFocus(i)
      return
    }
  }
}

function navigateToPreviousTask() {
  if (selectedTaskIndex <= 0) return

  // Find the previous feature with an image
  for (let i = selectedTaskIndex - 1; i >= 0; i--) {
    const prevTask = entities[i]
    if (prevTask?.images?.[0]) {
      selectedTask = prevTask
      selectedImage = prevTask.images?.[0] as unknown as ImageCtxEnvelope
      selectedTaskIndex = i
      updateRowFocus(i)
      return
    }
  }
}

// Derived states for navigation capability
let canNavigatePrevious = $derived(() => {
  if (selectedTaskIndex <= 0) return false
  // Check if there's any feature with an image before the current index
  for (let i = selectedTaskIndex - 1; i >= 0; i--) {
    if (entities[i]?.images?.[0]) return true
  }
  return false
})

let canNavigateNext = $derived(() => {
  if (selectedTaskIndex < 0) return false
  // Check if there's any feature with an image after the current index
  for (let i = selectedTaskIndex + 1; i < entities.length; i++) {
    if (entities[i]?.images?.[0]) return true
  }
  return false
})

function closeModal() {
  // Store the index before clearing state
  const indexToFocus = selectedTaskIndex
  selectedImage = null
  selectedTask = null
  selectedTaskIndex = -1
  // Restore focus to the last active row
  if (indexToFocus >= 0) {
    setTimeout(() => updateRowFocus(indexToFocus), 25)
  }
}

function openModal(image: ImageCtxEnvelope, task: Task) {
  selectedImage = image
  selectedTask = task
  selectedTaskIndex = entities.findIndex(f => f.id === task.id)
}

function updateRowFocus(index: number) {
  // Use the virtual list's scrollToIndex method
  const virtualList = listContainer?.querySelector('svelte-virtual-list-viewport')

  if (virtualList?.scrollToIndex) {
    // Scroll to the index using the virtual list's built-in method
    virtualList.scrollToIndex(index, true, false)

    // Focus the row after scrolling
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 50)
  } else {
    // Fallback: focus immediately if row is already visible
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 0)
  }
}
</script>

<div
  class="h-full overflow-y-auto overscroll-auto bg-linear-to-br from-rose-500 to-indigo-700 bg-fixed pb-6"
>
  <GroupedResourceIndex
    resource={FirstClassResource.task}
    {groupedEntities}
    bind:listContainer
  >
    {#snippet row(entity, index)}
      <TaskRow
        {entity}
        {index}
        {adminCtx}
        onImageClick={openModal}
        isSelected={selectedTaskIndex === index && selectedImage !== null}
      />
    {/snippet}
  </GroupedResourceIndex>
</div>

<!-- MODAL -->
{#if selectedImage && selectedTask}
  <FullScreenViewer
    appCtx={adminCtx.appCtx}
    {adminCtx}
    image={selectedImage}
    feature={selectedTask.feature}
    canNavigatePrevious={canNavigatePrevious()}
    canNavigateNext={canNavigateNext()}
    onClose={closeModal}
    onNavigateNext={navigateToNextTask}
    onNavigatePrevious={navigateToPreviousTask}
  />
{/if}
