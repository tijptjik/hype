<script lang="ts">
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// SERVICES
import { submitNewPhotos as submitNewPhotosAPI } from '$lib/client/services/task'
// COMPONENTS
import SubmitButton from '$lib/components/featureCard/actions/SubmitButton.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/types'

// PROPS
let { feature }: { feature: Feature } = $props()

// CONTEXT
const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const imageCtx = getImageCtx()

// STATE
let attribution = $derived(appCtx.getUser().attribution || m.anonymous())

// HANDLERS
async function submitNewPhotos() {
  // Validate inputs
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
    cardCtx.isSubmitting = true

    const { layer, project, organisation } = await appCtx.getHierarchy(feature)

    await submitNewPhotosAPI(
      feature,
      layer,
      project,
      organisation,
      imageCtx.getStagedQueue(),
      appCtx.user.id,
    )

    imageCtx.resetImages()

    cardCtx.state.mode = FeatureCardMode.SubmissionSuccess
    cardCtx.validationError = ''
  } catch (error) {
    console.error('Error submitting new photos:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    cardCtx.isSubmitting = false
  }
}
</script>

<SubmitButton onSubmit={submitNewPhotos} />
