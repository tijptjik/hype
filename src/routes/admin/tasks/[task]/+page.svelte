<script lang="ts">
// SVELTE
import { page } from '$app/state';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// I18N
import { m } from '$lib/i18n';
// ICONS
import { Inbox as TaskIcon } from '@steeze-ui/heroicons';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS :: COMMON
import Gallery from '$lib/components/images/gallery/Gallery.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
// COMPONENTS :: LAYOUT
import TaskRoot from '$lib/components/tasks/layout/EntityRoot.svelte';
import TaskHeader from '$lib/components/tasks/layout/Header.svelte';
import TaskMain from '$lib/components/tasks/layout/Main.svelte';
import TaskFooter from '$lib/components/tasks/layout/Footer.svelte';
import Title from '$lib/components/tasks/common/Title.svelte';
// COMPONENTS :: ACTIONS
import ReportedMissingActions from '$lib/components/tasks/actions/ReportedMissing.svelte';
import NewPhotoActions from '$lib/components/tasks/actions/NewPhoto.svelte';
import NewFeatureActions from '$lib/components/tasks/actions/NewFeature.svelte';
// COMPONENTS :: CONTROLS
import ReportedMissingControls from '$lib/components/tasks/controls/ReportedMissing.svelte';
import NewFeatureControls from '$lib/components/tasks/controls/NewFeature.svelte';
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  ImageContextResourceExtended
} from '$lib/enums';
// TYPES
import type { Image, Task, PageProps, Id } from '$lib/types';

let pageProps: PageProps<Task> = $props();
let task: Task = $derived(pageProps.data.task);

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet('core', pageProps.data.task.id, FirstClassResource.task);

// HEADER SETUP
const facetTabs = new Map();
facetTabs.set('core', m.born_plane_javelina_strive());

adminCtx.setHeaderForEntity(
  // svelte-ignore state_referenced_locally
  `${m.born_plane_javelina_strive()} #${task.id}`,
  TaskIcon,
  facetTabs
);

const taskId = $state(page.params.task);
const imageProviderProps = $derived({
  isAdminMode: true,
  // Only provide valid props when feature and featureId match
  // This prevents intermediate mismatched state during navigation
  isValid: task?.id === taskId,
  image:
    task?.id === taskId ? (pageProps.data.task.images?.[0]?.image as Image) : undefined,
  images:
    task?.id === taskId
      ? (pageProps.data.task.images?.map((taskImage) => taskImage.image) as Image[])
      : undefined,
  context:
    task?.id === taskId && task
      ? {
          ctxType: ImageContextResource.feature,
          ctxId: task.featureId as Id,
          ctxTypeSecondary: ImageContextResourceExtended.task,
          ctxIdSecondary: task.id,
          highlightedIds:
            task.images?.map((taskImage) => taskImage.imageId as Id) || [],
          ...adminCtx.appCtx.getHierarchySync(task)
        }
      : undefined
});
</script>

<!-- LAYOUT -->
<ImageProvider {page} {...imageProviderProps}>
  <div
    class="h-full overflow-hidden bg-gradient-to-br from-rose-500 to-indigo-700 bg-fixed p-6">
    <TaskRoot {task}>
      <TaskHeader {task} isRoundedBottom={false}>
        {#snippet Left()}
          <Title {task} />
        {/snippet}
        {#snippet Right()}
          {#if task.type === 'reportedMissing'}
            <ReportedMissingActions {task} />
          {:else if task.type === 'newPhoto'}
            <NewPhotoActions {task} />
          {:else if task.type === 'newFeature'}
            <NewFeatureActions {task} />
          {/if}
        {/snippet}
      </TaskHeader>
      <TaskMain {task}>
        <div class="flex min-h-0 flex-1 flex-col items-stretch gap-4 @container">
          <Viewer isDropzone={!task.isReviewed} />
          <TaskFooter>
            <Gallery hasDropzone={false} />
          </TaskFooter>
        </div>
        {#if task.type === 'reportedMissing'}
          <ReportedMissingControls {task} />
        {:else if task.type === 'newFeature'}
          <NewFeatureControls {task} />
        {/if}
      </TaskMain>
    </TaskRoot>
  </div>
</ImageProvider>
