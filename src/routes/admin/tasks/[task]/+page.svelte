<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS :: COMMON
import Image from '$lib/components/tasks/common/Image.svelte';
import Gallery from '$lib/components/tasks/common/Gallery.svelte';
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
import { HierarchicalResource, ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
// TYPES
import type { Task, PageProps, Organisation, Project, Id } from '$lib/types';

let pageProps: PageProps<Task> = $props();
let task = $derived(pageProps.data.task);

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setEntity(pageProps.data.task.id, HierarchicalResource.task);
resourceState.setFacet('core');
</script>

<!-- LAYOUT -->
<ImageProvider
  mode="gallery"
  isAdminMode={true}
  ctxType={ImageContextResource.feature}
  ctxId={task.featureId as Id}
  organisation={resourceState.getEntity(
    HierarchicalResource.organisation,
    task.organisationId,
    true
  ) as Organisation}
  project={resourceState.getEntity(
    HierarchicalResource.project,
    task.projectId,
    true
  ) as Project}
  ctxTypeSecondary={ImageContextResourceExtended.task}
  ctxIdSecondary={task.id}
  highlightedIds={task.images?.map((taskImage) => taskImage.imageId as Id) || []}>
  <div
    class="h-full overflow-y-auto bg-gradient-to-br from-rose-500 to-indigo-700 bg-fixed p-6">
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
        <div class="flex flex-1 flex-col">
          <Image isDropzone={!task.isReviewed} />
          <TaskFooter>
            <Gallery />
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
