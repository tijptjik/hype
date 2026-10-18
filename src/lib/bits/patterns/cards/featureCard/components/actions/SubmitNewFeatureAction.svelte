<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
// SERVICES
import { submitNewFeature as submitNewFeatureAPI } from '#lib/client/services/task.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { ImageUpload } from '#lib/db/zod/schema/image.types.js'
import type { NewFeatureTask } from '#lib/api/services/taskCreation.types.js'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const omniCtx = getOmniCtx()
const imageCtx = getImageCtx()

async function submitNewFeature(): Promise<void> {
  const newFeature = appCtx.draft.current as NewFeatureTask
  const title =
    newFeature?.feature?.i18n?.[getLocaleKey()]?.title ??
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

  if (!newFeature?.feature?.i18n?.[getLocaleKey()]?.title) {
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
    appCtx.draft.reset()
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
