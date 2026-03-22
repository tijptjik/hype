<script lang="ts">
// SVELTE
import type { Page } from '@sveltejs/kit'
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// CLIENT SERVICES
import { updateImagePresentationMode } from '$lib/client/services/image'
// BITS COMPONENTS
import { Switch } from '$lib/bits/custom/switch'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
// COMPONENTS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
import Viewer from '$lib/components/common/Viewer.svelte'
// ICONS
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import CheckIcon from 'virtual:icons/lucide/check'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { ImageCtxConstructorOptions } from '$lib/types'
import type { ImageCtxEnvelope, ImageEditCtx } from '$lib/db/zod/schema/image.types'
import type { SectionHeaderAction } from '$lib/bits/custom/form'

let {
  page,
  entityId,
  imageProviderProps,
  currentImage = null,
  ctx,
  headerActions = [],
  canEditPresentationMode = true,
  canEditDropzone = true,
  onPresentationModeCommitted,
}: {
  page: Page
  entityId?: string | null
  imageProviderProps: ImageCtxConstructorOptions
  currentImage?: ImageCtxEnvelope | null
  ctx?: ImageEditCtx
  headerActions?: SectionHeaderAction[]
  canEditPresentationMode?: boolean
  canEditDropzone?: boolean
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
const imageProviderModel = useImageProviderModel(
  () => page,
  () => imageProviderProps,
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
  if (!canEditPresentationMode) return
  isUpdatingPresentationMode = true
  setPresentationModeFeedback('loading')
  try {
    const didUpdate = await updateImagePresentationMode({
      currentImage: effectiveImage?.image ?? null,
      nextChecked,
      ctx,
      onSuccess: nextMode => {
        if (effectiveImage?.image) {
          viewerActiveImage = {
            ...effectiveImage,
            image: {
              ...effectiveImage.image,
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
        <ImageProvider model={imageProviderModel}>
          <div class="bits-entity-image__frame">
            <SectionHeader
              title={m.admin__forms_organisation_image_title()}
              class="bits-entity-image__header"
              size="sm"
            >
              {#snippet right()}
                <div class="bits-entity-image__switch-wrap">
                  {#each headerActions as action, index (action.key ?? `${action.text ?? 'action'}-${index}`)}
                    <SectionHeaderPrimitive.Action {...action} />
                  {/each}
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
                    disabled={!canEditPresentationMode ||
                      !hasActiveImage ||
                      isUpdatingPresentationMode}
                    leftText="Contain"
                    rightText="Cover"
                    onCheckedChange={value => void onPresentationModeChange(value)}
                  />
                </div>
              {/snippet}
            </SectionHeader>
            <main class="bits-entity-image__viewer">
              <Viewer
                isDropzone={canEditDropzone}
                layout={isCoverPresentationMode ? 'cover' : 'contain'}
                onActiveImageChange={image => {
                  viewerActiveImage = image
                }}
                onLayoutSettled={() => {
                  if (typeof window === 'undefined') return
                  window.dispatchEvent(new CustomEvent('bits:facet-layout-settled'))
                }}
              />
            </main>
          </div>
        </ImageProvider>
      {/key}
    </div>
  {:else}
    <div class="bits-entity-image__empty">
      {m.admin__forms_organisation_image_save_hint()}
    </div>
  {/if}
</div>
