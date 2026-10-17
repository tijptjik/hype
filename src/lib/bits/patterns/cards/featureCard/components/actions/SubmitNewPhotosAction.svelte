<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
// SERVICES
import { submitNewPhotos as submitNewPhotosAPI } from '#lib/client/services/task.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

let { feature }: { feature: Feature } = $props()

const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const imageCtx = getImageCtx()

const attribution = $derived(appCtx.getUser()?.attribution || m.anonymous())
const featureTitle = $derived(
  feature.i18n?.[getLocale()]?.title ?? feature.i18n?.en?.title ?? feature.id,
)

async function submitNewPhotos(): Promise<void> {
  if (imageCtx.getStagedImages().length === 0) {
    cardCtx.setError(m.validation__at_least_one_image())
    return
  }

  if (
    ((attribution.trim().length || 0) === 0 || !attribution) &&
    ((cardCtx.getAttribution().trim().length || 0) === 0 || !cardCtx.getAttribution())
  ) {
    cardCtx.setError(m.validation__attribution_required())
    return
  }

  try {
    cardCtx.resetError()
    cardCtx.isSubmitting = true

    const { layer, project, organisation } = await appCtx.getHierarchy(feature)
    if (!layer || !project || !organisation) {
      throw new Error('Unable to resolve submission hierarchy')
    }

    await submitNewPhotosAPI(
      feature,
      layer,
      project,
      organisation,
      imageCtx.getStagedQueue(),
      {
        onStatusChange: label => {
          cardCtx.setSubmissionLabel(label)
        },
      },
    )

    cardCtx.setMode(FeatureCardMode.Display)
    await tick()
    await imageCtx.refreshImages()
    imageCtx.cleanupStagedImages()
    imageCtx.resetUploadQueue()
    imageCtx.resetTargetImage()
    imageCtx.resetActivePreview()
    cardCtx.resetError()
    toast.success(m.add_photos__success(), {
      description: m.add_photos__submitted_description({
        featureTitle,
      }),
    })
  } catch (error) {
    console.error('Error submitting new photos:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    cardCtx.isSubmitting = false
    cardCtx.resetSubmissionState()
  }
}
</script>

<FeatureCardSubmitButton onSubmit={submitNewPhotos} />
