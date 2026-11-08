<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { preloadCode } from '$app/navigation'
// CONTEXT
import { useAdminIndexQuery } from '#lib/adapters/useAdminIndexQuery.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// SERVICES
import {
  createSelectFilter,
  createSortable,
  createSortables,
  createToggleFilter,
} from '#lib/client/services/filters.js'
import { getTaskReviewActionLabel } from '#lib/client/services/task.js'
// BITS PATTERNS
import { GroupedResourceIndex, ResourceControlBar, TaskRow } from '#lib/bits/index.js'
// NAVIGATION
import { navigateOnAdmin } from '#lib/navigation/index.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import FunnelIcon from 'virtual:icons/proicons/filter'
import TaskIcon from 'virtual:icons/proicons/archive'
// TYPES
import { reviewActions } from '#lib/api/services/taskReview.js'
import type { Id } from '#lib/types.js'
import type { ResourceControlBarConfig } from '#lib/client/services/resourceFilters.types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

const filters = {
  resource: FirstClassResource.task,
  sections: [
    {
      key: 'filters',
      title: m.filters__filter_by(),
      icon: FunnelIcon,
      filters: [
        createSelectFilter('type', {
          label: m.filters__type(),
          placeholder: `${m.filters__all()} ${m.filters__type().toLowerCase()}`,
          allowDeselect: true,
          refreshResource: FirstClassResource.task,
          options: [
            { value: 'newFeature', label: m.smart_crazy_cuckoo_play() },
            { value: 'newPhoto', label: m.aware_sea_goose_nail() },
            { value: 'reportedMissing', label: m.noble_zany_crow_dance() },
          ],
        }),
        createSelectFilter('reviewAction', {
          label: m.filters__action(),
          placeholder: `${m.filters__all()} ${m.filters__action().toLowerCase()}`,
          allowDeselect: true,
          refreshResource: FirstClassResource.task,
          options: reviewActions.map(action => ({
            value: action,
            label: getTaskReviewActionLabel(action),
          })),
        }),
        createToggleFilter('reviewOutcome', {
          label: m.filters__result(),
          falseLabel: m.alive_north_albatross_lead(),
          trueLabel: m.admin__project_license_accept(),
          refreshResource: FirstClassResource.task,
        }),
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

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('title', m.field_name()),
  createSortable('type', m.filters__type()),
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// Warm the editor modules while the queue is visible, before a task is selected.
onMount(() => {
  void preloadCode('/admin/tasks/[task]').catch(() => {})
})
adminCtx.setFacet(false, false, FirstClassResource.task)

// ELEMENTS
let listContainer: HTMLElement | null = $state(null)
let scrollIndexByEntityId = $state.raw<Map<string, number>>(new Map())

let selectedImage = $state<ImageCtxEnvelope | null>(null)
let selectedTask = $state<Task | null>(null)

const indexQuery = useAdminIndexQuery(adminCtx, 'task')
let entities: Task[] = $derived(indexQuery.rows as Task[])

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
      // Unfiltered tasks can belong to projects beyond the sidebar's loaded page.
      const project = (adminCtx.view.getResourceByIdSync(
        FirstClassResource.project,
        projectId,
      ) ?? projectTasks[0]?.project) as Project
      return {
        group: project,
        entities: projectTasks,
      }
    })
    .filter(({ group }) => group != null), // Filter out genuinely unresolved projects during navigation
)

$effect(() => {
  headerCtrl.setHeaderForIndex(m.navbar__tasks(), TaskIcon, {
    showNew: false,
  })
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.task,
      count: indexQuery.totalCount,
      countLoading: indexQuery.countLoading,
      filters,
      sortables,
    },
    {
      isVisible: adminCtx.listUi.state.isControlBarVisible[FirstClassResource.task],
    },
  )
  headerCtrl.clearFooter()
})



// Derived states for navigation capability



/**
 * Opens the review workspace from a queue thumbnail.
 * @param _image - Clicked task image
 * @param task - Task to review
 * @returns Nothing
 */
function openModal(_image: ImageCtxEnvelope, task: Task): void {
  navigateOnAdmin(adminCtx, FirstClassResource.task, task.id)
}

</script>

<div class="text-foreground flex min-h-0 flex-1 flex-col overflow-hidden">
  {#if indexQuery.failed}
    <div role="alert" class="px-6 py-2">
      <span>{m.resource_action_failed()}</span>
      <button
        type="button"
        class="ml-3 underline"
        onclick={() => void indexQuery.retry()}
      >
        {m.bootstrap__retry()}
      </button>
    </div>
  {/if}
  <GroupedResourceIndex
    resource={FirstClassResource.task}
    {groupedEntities}
    isLoading={indexQuery.countLoading}
    failed={indexQuery.failed}
    bind:listContainer
    bind:scrollIndexByEntityId
  >
    {#snippet row(entity, index)}
      <TaskRow
        {entity}
        {index}
        {adminCtx}
        onImageClick={openModal}
        isSelected={selectedTask?.id === entity.id && selectedImage !== null}
      />
    {/snippet}
  </GroupedResourceIndex>
</div>
