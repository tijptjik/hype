<script lang="ts">
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// SERVICES
import { submitMissingReport as submitMissingReportAPI } from '$lib/client/services/task'
// COMPONENTS
import SubmitButton from '$lib/components/featureCard/actions/SubmitButton.svelte'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
import type { Feature } from '$lib/db/zod/schema/feature.types'
// TYPES

// PROPS
let { feature }: { feature: Feature } = $props()

// CONTEXT
const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const imageCtx = getImageCtx()

// HANDLERS
async function submitMissingReport() {
  // Validate inputs
  if (imageCtx.getStagedQueue().length === 0) {
    cardCtx.setError(m.validation__at_least_one_image())
    return
  }

  if (cardCtx.userData.missingReason.trim().length < 5) {
    cardCtx.validationError = m.validation__at_least_five_characters()
    return
  }

  try {
    cardCtx.isSubmitting = true

    const { layer, project, organisation } = await appCtx.getHierarchy(feature)

    await submitMissingReportAPI(
      feature,
      layer,
      project,
      organisation,
      cardCtx.userData.missingReason,
      imageCtx.getStagedQueue(),
    )

    imageCtx.resetImages()

    cardCtx.userData.missingReason = ''

    cardCtx.state.mode = FeatureCardMode.SubmissionSuccess
    cardCtx.validationError = ''
  } catch (error) {
    console.error('Error submitting missing report:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    cardCtx.isSubmitting = false
  }
}
</script>

<SubmitButton onSubmit={submitMissingReport} />
