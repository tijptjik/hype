<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS :: COMMON
import Image from '$lib/components/tasks/common/Image.svelte';
import Gallery from '$lib/components/tasks/common/Gallery.svelte';
// COMPONENTS :: LAYOUT
import Task from '$lib/components/tasks/layout/EntityRoot.svelte';
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
// COMPONENTS :: INFO
import Info from '$lib/components/forms/extra/Info.svelte';
import ReportedMissingContent from '$lib/components/tasks/info/ReportedMissing.svelte';
import NewPhotoContent from '$lib/components/tasks/info/NewPhoto.svelte';
import NewFeatureContent from '$lib/components/tasks/info/NewFeature.svelte';

// TYPES
import type { TaskAPI, EntityRouter, PageProps } from '$lib/types';

let pageProps: PageProps<TaskAPI> = $props();
let { task } = pageProps.data;

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// routerState.updateWith({
//   resource: 'task',
//   entity: task.id,
//   facet: false
// });

// SYNC :: Update resource state with current entity
$effect(() => {
  resourceState.update('feature', task.feature);
});

// SYNC :: Await immediately resolved promise to react to value change.
const forceUpdate = async (_) => {};
let doRerender = $state(0);
</script>

{#await forceUpdate(doRerender) then _}
  <!-- LAYOUT -->
  <div
    class="h-full overflow-y-auto bg-gradient-to-br from-rose-500 to-indigo-700 bg-fixed p-6">
    <Task {task}>
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
        <Info>
          {#if task.type === 'reportedMissing'}
            <ReportedMissingContent />
          {:else if task.type === 'newPhoto'}
            <NewPhotoContent />
          {:else if task.type === 'newFeature'}
            <NewFeatureContent />
          {/if}
        </Info>
      </TaskHeader>
      <TaskMain {task}>
        <div class="flex flex-1 flex-col">
          <Image {task} />
          <TaskFooter>
            <Gallery {task} />
          </TaskFooter>
        </div>
        {#if task.type === 'reportedMissing'}
          <ReportedMissingControls {task} />
        {:else if task.type === 'newFeature'}
          <NewFeatureControls {task} />
        {/if}
      </TaskMain>
    </Task>
  </div>
{/await}
