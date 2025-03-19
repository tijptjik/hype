<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
// TYPES
import type { SectionProps, GetImageAPI, ResourceType } from '$lib/types';

let sectionProps: SectionProps & { image: GetImageAPI | null } = $props();

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();
</script>

<div
  class="relative z-10 flex h-[calc(100vh-196px)] w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0">
  <Header {...sectionProps} />
  <main class="relative w-full flex-grow overflow-hidden rounded-b-2xl bg-base-300">
    <div class="absolute inset-0 h-full w-full flex-none">
      <Viewer
        {...sectionProps}
        editContext={{
          refType: resourceState.activeResource as ResourceType,
          refId: resourceState.activeEntity
        }}
        enableDropzone={true}
        enableReplacement={true} />
    </div>
  </main>
</div>
