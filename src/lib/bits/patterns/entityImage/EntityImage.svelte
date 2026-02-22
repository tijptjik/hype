<script lang="ts">
// SVELTE
import type { Page } from '@sveltejs/kit'
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CLIENT SERVICES
import { updateImagePresentationMode } from '$lib/client/services/image'
// BITS COMPONENTS
import { Switch } from '$lib/bits/custom/switch'
import { SectionHeader } from '$lib/bits/custom/form'
// COMPONENTS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte'
import Viewer from '$lib/components/common/Viewer.svelte'
// ICONS
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import CheckIcon from 'virtual:icons/lucide/check'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type {
  ImageCtxConstructorOptions,
  ImageCtxEnvelope,
  ImageEditCtx,
} from '$lib/types'

let {
  page,
  entityId,
  imageProviderProps,
  currentImage = null,
  ctx,
  onPresentationModeCommitted,
}: {
  page: Page
  entityId?: string | null
  imageProviderProps: ImageCtxConstructorOptions
  currentImage?: ImageCtxEnvelope | null
  ctx?: ImageEditCtx
  onPresentationModeCommitted?: (nextMode: 'cover' | 'contain') => void
} = $props()

let isUpdatingPresentationMode = $state(false)
let presentationModeFeedback = $state<'idle' | 'loading' | 'success' | 'error'>('idle')
let presentationModeFeedbackTimer: ReturnType<typeof setTimeout> | null = $state(null)
let viewerActiveImage = $state<ImageCtxEnvelope | null>(null)

const effectiveImage = $derived(
  (viewerActiveImage ?? currentImage ?? null) as ImageCtxEnvelope | null,
)
const hasActiveImage = $derived(Boolean(effectiveImage?.image?.id))
const isCoverPresentationMode = $derived(
  effectiveImage?.image?.presentationMode === 'cover',
)

function clearPresentationModeFeedbackTimer(): void {
  if (!presentationModeFeedbackTimer) return
  clearTimeout(presentationModeFeedbackTimer)
  presentationModeFeedbackTimer = null
}

function setPresentationModeFeedback(
  state: 'idle' | 'loading' | 'success' | 'error',
): void {
  clearPresentationModeFeedbackTimer()
  presentationModeFeedback = state
  if (state === 'success' || state === 'error') {
    presentationModeFeedbackTimer = setTimeout(() => {
      presentationModeFeedback = 'idle'
      presentationModeFeedbackTimer = null
    }, 2000)
  }
}

async function onPresentationModeChange(nextChecked: boolean | null): Promise<void> {
  isUpdatingPresentationMode = true
  setPresentationModeFeedback('loading')
  try {
    const didUpdate = await updateImagePresentationMode({
      currentImage: effectiveImage?.image ?? null,
      nextChecked,
      ctx,
      onSuccess: nextMode => {
        if (viewerActiveImage) {
          viewerActiveImage = {
            ...viewerActiveImage,
            image: {
              ...viewerActiveImage.image,
              presentationMode: nextMode,
            },
          }
        }
        onPresentationModeCommitted?.(nextMode)
        setPresentationModeFeedback('success')
      },
      onFailure: () => {
        setPresentationModeFeedback('error')
        toast.error(m.long_crazy_peacock_care())
      },
    })

    if (!didUpdate && presentationModeFeedback === 'loading') {
      setPresentationModeFeedback('idle')
    }
  } finally {
    isUpdatingPresentationMode = false
  }
}

$effect(() => {
  return () => {
    clearPresentationModeFeedbackTimer()
  }
})
</script>

<div class="bits-entity-image">
  {#if entityId}
    <div class="bits-entity-image__provider-wrap">
      {#key entityId}
        <ImageProvider {page} {...imageProviderProps}>
          <div class="bits-entity-image__frame">
            <SectionHeader
              title={m.admin__forms_organisation_image_title()}
              class="bits-entity-image__header"
              size="sm"
            >
              {#snippet center()}
              {/snippet}
              {#snippet right()}
                <div class="bits-entity-image__switch-wrap">
                  <span class="bits-entity-image__feedback">
                    {#if presentationModeFeedback === 'loading'}
                      <LoaderCircleIcon
                        class="bits-entity-image__feedback-icon bits-entity-image__feedback-icon--loading"
                      />
                    {:else if presentationModeFeedback === 'success'}
                      <CheckIcon
                        class="bits-entity-image__feedback-icon bits-entity-image__feedback-icon--success"
                      />
                    {:else if presentationModeFeedback === 'error'}
                      <XIcon
                        class="bits-entity-image__feedback-icon bits-entity-image__feedback-icon--error"
                      />
                    {/if}
                  </span>
                  <Switch
                    checked={isCoverPresentationMode}
                    disabled={!hasActiveImage || isUpdatingPresentationMode}
                    leftText="Contain"
                    rightText="Cover"
                    onCheckedChange={value => void onPresentationModeChange(value)}
                  />
                </div>
              {/snippet}
            </SectionHeader>
            <main class="bits-entity-image__viewer">
              <Viewer
                isDropzone={true}
                layout={isCoverPresentationMode ? 'cover' : 'contain'}
                onActiveImageChange={image => {
                  viewerActiveImage = image
                }}
              />
            </main>
          </div>
        </ImageProvider>
      {/key}
    </div>
  {:else}
    <p class="bits-entity-image__empty">
      {m.admin__forms_organisation_image_save_hint()}
    </p>
  {/if}
</div>
