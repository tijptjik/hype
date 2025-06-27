<script lang="ts">
// COMPONENTS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
// TYPES
import type { ImageDB, Feature, Organisation, Project, ImageDBBasic } from '$lib/types';
import type { AdminCtx } from '$lib/context/admin.svelte';
import { navigateOnAdmin } from '$lib/navigation';
import Viewer from '../common/Viewer.svelte';

type Props = {
  adminCtx: AdminCtx;
  image: ImageDB | ImageDBBasic;
  feature: Feature;
  isAdminMode?: boolean;
  currentIndex?: number;
  totalCount?: number;
  canNavigatePrevious?: boolean;
  canNavigateNext?: boolean;
  onClose: () => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
};

// STATE : PROPS
let {
  adminCtx,
  image,
  feature,
  isAdminMode = false,
  canNavigatePrevious = false,
  canNavigateNext = false,
  onClose,
  onNavigateNext,
  onNavigatePrevious
}: Props = $props();

let organisation = $derived<Organisation | undefined>(
  feature ? adminCtx.appCtx.cache.organisation.get(feature.organisationId) : undefined
);

let project = $derived<Project | undefined>(
  feature ? adminCtx.appCtx.cache.project.get(feature.projectId) : undefined
);

function handleKeydown(event: KeyboardEvent) {
  // Only handle events if the modal is actually open and feature exists
  if (!feature || !image) return;

  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const featureId = feature.id; // Capture the ID before dispatching close
    // Navigate to feature address facet
    onClose();
    navigateOnAdmin(adminCtx, FirstClassResource.feature, featureId, 'images');
  } else if (event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey && canNavigatePrevious && onNavigatePrevious) {
      onNavigatePrevious();
    } else if (!event.shiftKey && canNavigateNext && onNavigateNext) {
      onNavigateNext();
    }
  }
}

function closeModal() {
  onClose();
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
  onclick={closeModal}
  role="dialog"
  aria-modal="true">
  <div class="h-screen w-screen" onclick={(e) => e.stopPropagation()}>
    <div class="h-full w-full" onclick={closeModal}>
      {#if feature}
        <ImageProvider
          {isAdminMode}
          context={{
            ctxType: FirstClassResource.feature as unknown as ImageContextResource,
            ctxId: feature.id,
            organisation,
            project
          }}
          {image}>
          <Viewer isDropzone={false} hideActions={true} />
        </ImageProvider>
      {/if}
    </div>
  </div>
</div>
