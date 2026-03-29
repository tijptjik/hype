<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// I18N
import { m } from '$lib/i18n'
// ICONS
import TaskIcon from 'virtual:icons/lucide/inbox'
// PROVIDERS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
// COMPONENTS :: COMMON
import Viewer from '$lib/components/common/Viewer.svelte'
// COMPONENTS :: LAYOUT
import TaskRoot from '$lib/components/tasks/layout/EntityRoot.svelte'
import TaskHeader from '$lib/components/tasks/layout/Header.svelte'
import TaskMain from '$lib/components/tasks/layout/Main.svelte'
import TaskFooter from '$lib/components/tasks/layout/Footer.svelte'
import Title from '$lib/components/tasks/common/Title.svelte'
// COMPONENTS :: ACTIONS
import ReportedMissingActions from '$lib/components/tasks/actions/ReportedMissing.svelte'
import NewPhotoActions from '$lib/components/tasks/actions/NewPhoto.svelte'
import NewFeatureActions from '$lib/components/tasks/actions/NewFeature.svelte'
// COMPONENTS :: CONTROLS
import ReportedMissingControls from '$lib/components/tasks/controls/ReportedMissing.svelte'
import NewFeatureControls from '$lib/components/tasks/controls/NewFeature.svelte'
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  ImageContextResourceExtended,
} from '$lib/enums'
// TYPES
import type { Task, PageProps, Id } from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

let pageProps: PageProps<Task> = $props()
let task: Task = $derived(pageProps.data.task)

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet('core', pageProps.data.task.id, FirstClassResource.task)

// HEADER SETUP
const facetTabs = new Map()
facetTabs.set('core', m.born_plane_javelina_strive())

// Only set header if task exists to prevent undefined access
// svelte-ignore state_referenced_locally
if (task?.id) {
  headerCtrl.setHeaderForEntity(
    // svelte-ignore state_referenced_locally
    `${m.born_plane_javelina_strive()} #${task.id}`,
    TaskIcon,
    facetTabs,
  )
}

const taskId = $derived(page.params.task)
const imageProviderProps = $derived({
  isAdminMode: true,
  // Only provide valid props when feature and featureId match
  // This prevents intermediate mismatched state during navigation
  isValid: task?.id === taskId,
  image:
    task?.id === taskId
      ? ((pageProps.data.task.images?.[0] as ImageCtxEnvelope | undefined) ?? undefined)
      : undefined,
  images:
    task?.id === taskId
      ? ((pageProps.data.task.images as ImageCtxEnvelope[] | undefined) ?? undefined)
      : undefined,
  highlightedIds: task?.images?.map(taskImage => taskImage.imageId as Id) || [],
  ...(task ? adminCtx.appCtx.getHierarchySync(task) : {}),
  context:
    task?.id === taskId && task
      ? {
          ctxType: ImageContextResource.feature,
          ctxId: task.featureId as Id,
          ctxTypeSecondary: ImageContextResourceExtended.task,
          ctxIdSecondary: task.id,
        }
      : undefined,
})
const imageProviderModel = useImageProviderModel(
  () => page,
  () => imageProviderProps,
)
</script>

<!-- LAYOUT -->
<ImageProvider model={imageProviderModel}>
  <div
    class="h-full overflow-hidden bg-linear-to-br from-rose-500 to-indigo-700 bg-fixed p-6"
  >
    {#if task?.id}
      <TaskRoot {task}>
        <TaskHeader {task} isRoundedBottom={false}>
          {#snippet Left()}
            <Title {task} />
          {/snippet}
          {#snippet Right()}
            {#if task.type && task.type === 'reportedMissing'}
              <ReportedMissingActions {task} />
            {:else if task.type && task.type === 'newPhoto'}
              <NewPhotoActions {task} />
            {:else if task.type && task.type === 'newFeature'}
              <NewFeatureActions {task} />
            {/if}
          {/snippet}
        </TaskHeader>
        <TaskMain {task}>
          <div class="flex min-h-0 flex-1 flex-col items-stretch gap-4 @container">
            <Viewer isDropzone={!task.isReviewed} />
            <!-- <TaskFooter>  -->
            <!-- <Gallery hasDropzone={false} /> -->
            <!-- </TaskFooter> -->
          </div>
          {#if task?.type === 'reportedMissing'}
            <ReportedMissingControls {task} />
          {:else if task?.type === 'newFeature'}
            <NewFeatureControls {task} />
          {/if}
        </TaskMain>
      </TaskRoot>
    {:else}
      <div class="flex h-full items-center justify-center">
        <div class="loading loading-spinner loading-lg"></div>
      </div>
    {/if}
  </div>
</ImageProvider>
