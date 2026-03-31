<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// COMPONENTS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
import Viewer from '../common/Viewer.svelte'
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { AppCtx } from '$lib/context/app.svelte'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'

// CONTEXT
let omniCtx = getOmniCtx()

type Props = {
  appCtx: AppCtx
  adminCtx?: AdminCtx
  image: ImageCtxEnvelope
  feature: Feature
  currentIndex?: number
  totalCount?: number
  canNavigatePrevious?: boolean
  canNavigateNext?: boolean
  onClose: () => void
  onNavigateNext?: () => void
  onNavigatePrevious?: () => void
}

// STATE : PROPS
let {
  appCtx,
  adminCtx,
  image,
  feature,
  canNavigatePrevious = false,
  canNavigateNext = false,
  onClose,
  onNavigateNext,
  onNavigatePrevious,
}: Props = $props()

let organisation = $derived<Organisation | undefined>(
  feature ? appCtx.cache.organisation.get(feature.organisationId) : undefined,
)

let project = $derived<Project | undefined>(
  feature ? appCtx.cache.project.get(feature.projectId) : undefined,
)
const imageProviderModel = useImageProviderModel(
  () => page,
  () => ({
    isAdminMode: adminCtx !== undefined,
    context: {
      ctxType: FirstClassResource.feature as unknown as ImageContextResource,
      ctxId: feature.id,
      organisation: organisation as never,
      project: project as never,
    },
    image,
  }),
)

function handleKeydown(event: KeyboardEvent) {
  // Only handle events if the modal is actually open and feature exists
  if (!feature || !image) return

  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    const featureId = feature.id // Capture the ID before dispatching close
    // Navigate to feature address facet
    onClose()
    if (adminCtx) {
      navigateOnAdmin(adminCtx, FirstClassResource.feature, featureId, 'images')
    } else {
      omniCtx.navNext()
    }
  } else if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey && canNavigatePrevious && onNavigatePrevious) {
      onNavigatePrevious()
    } else if (!event.shiftKey && canNavigateNext && onNavigateNext) {
      onNavigateNext()
    }
  }
}

function closeModal() {
  onClose()
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
  onclick={closeModal}
  role="dialog"
  aria-modal="true"
>
  <div class="h-screen w-screen" onclick={(e) => e.stopPropagation()}>
    <div class="h-full w-full" onclick={closeModal}>
      {#if feature}
        <ImageProvider model={imageProviderModel}>
          <Viewer isDropzone={false} hideActions={true} />
        </ImageProvider>
      {/if}
    </div>
  </div>
</div>
