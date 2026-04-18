<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocale, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// SERVICES
import { submitNewFeature as submitNewFeatureAPI } from '$lib/client/services/task'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { ImageUpload } from '$lib/db/zod/schema/image.types'
import type { NewFeatureTask } from '$lib/types'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const omniCtx = getOmniCtx()
const imageCtx = getImageCtx()

async function submitNewFeature(): Promise<void> {
  const newFeature = appCtx.getNewFeature() as NewFeatureTask
  const title =
    newFeature?.feature?.i18n?.[getLocale()]?.title ??
    newFeature?.feature?.i18n?.en?.title ??
    'Untitled feature'
  const layer = newFeature?.layerId ? appCtx.cache.layer.get(newFeature.layerId) : null
  const layerName = layer
    ? appCtx.getContextualLayerName(layer, false, false) || 'this layer'
    : 'this layer'

  if (imageCtx.getStagedImages().length === 0) {
    cardCtx.setError(m.validation__at_least_one_image())
    return
  }

  if (!newFeature?.feature?.i18n?.[getLocale()]?.title) {
    cardCtx.validationError = m.validation__title_required()
    return
  }

  try {
    cardCtx.resetError()
    cardCtx.isSubmitting = true

    if (!newFeature) return

    await submitNewFeatureAPI(newFeature, imageCtx.getStagedQueue() as ImageUpload[], {
      onStatusChange: label => {
        cardCtx.setSubmissionLabel(label)
      },
    })

    toast.success('Submission Success', {
      description: `${title} was suggested for addition to ${layerName}.`,
    })

    omniCtx.close()
    cardCtx.setMode(FeatureCardMode.Display)
    imageCtx.resetImages()
    cardCtx.userData.photos = []
    appCtx.resetNewFeature()
    cardCtx.resetError()
  } catch (error) {
    console.error('Error submitting new feature:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    cardCtx.isSubmitting = false
    cardCtx.resetSubmissionState()
  }
}
</script>

<FeatureCardSubmitButton onSubmit={submitNewFeature} />
