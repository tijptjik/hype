<script lang="ts">
// SVELTE
import { createEventDispatcher } from 'svelte';
// COMPONENTS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
// TYPES
import type { ImageDB, Feature, Organisation, Project } from '$lib/types';

type Props = {
  image: ImageDB;
  feature: Feature;
  organisation?: Organisation;
  project?: Project;
  isAdminMode?: boolean;
};

// STATE : PROPS
let {
  image,
  feature,
  organisation,
  project,
  isAdminMode = false
}: Props = $props();

const dispatch = createEventDispatcher<{
  close: void;
}>();

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === ' ') {
    dispatch('close');
  }
}

function closeModal() {
  dispatch('close');
}
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
  onclick={closeModal}
  role="dialog"
  aria-modal="true">
  <div class="h-screen w-screen" onclick={(e) => e.stopPropagation()}>
    <div class="h-full w-full" onclick={closeModal}>
      <ImageProvider
        ctxId={feature.id}
        ctxType={FirstClassResource.feature as unknown as ImageContextResource}
        {image}
        {isAdminMode}
        mode="gallery"
        {organisation}
        {project}>
        <Viewer isDropzone={false} hideActions={true} />
      </ImageProvider>
    </div>
  </div>
</div> 