<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// SERVICES
import { submitMissingReport as submitMissingReportAPI } from '$lib/client/services/task'
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

let { feature }: { feature: Feature } = $props()

const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const imageCtx = getImageCtx()

async function submitMissingReport(): Promise<void> {
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

<FeatureCardSubmitButton onSubmit={submitMissingReport} />
