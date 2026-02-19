<script lang="ts">
import { toast } from 'svelte-sonner'
// I18N
import { getLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// SERVICES
import { submitNewFeature as submitNewFeatureAPI } from '$lib/client/services/task'
// COMPONENTS
import SubmitButton from '$lib/components/featureCard/actions/SubmitButton.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { ImageUpload, NewFeatureTask } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const omniCtx = getOmniCtx()
const imageCtx = getImageCtx()

// HANDLERS
async function submitNewFeature() {
  const newFeature = appCtx.getNewFeature() as NewFeatureTask

  // Validate inputs
  if (imageCtx.getStagedImages().length === 0) {
    cardCtx.setError(m.validation__at_least_one_image())
    return
  }

  if (!newFeature?.feature?.i18n?.[getLocale()]?.title) {
    cardCtx.validationError = m.validation__title_required()
    return
  }

  try {
    cardCtx.isSubmitting = true

    if (!newFeature) return

    await submitNewFeatureAPI(newFeature, imageCtx.getStagedQueue() as ImageUpload[])

    toast.success(m.new_feature__success())

    omniCtx.close()
    cardCtx.setMode(FeatureCardMode.Display)
    cardCtx.userData.photos = []
    appCtx.resetNewFeature()
    cardCtx.validationError = ''
  } catch (error) {
    console.error('Error submitting new feature:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    cardCtx.isSubmitting = false
  }
}
</script>

<SubmitButton onSubmit={submitNewFeature} />
