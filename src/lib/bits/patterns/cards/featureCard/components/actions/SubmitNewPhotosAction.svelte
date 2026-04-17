<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocale, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// SERVICES
import { submitNewPhotos as submitNewPhotosAPI } from '$lib/client/services/task'
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

const attribution = $derived(appCtx.getUser()?.attribution || m.anonymous())
const featureTitle =
  feature.i18n?.[getLocale()]?.title ?? feature.i18n?.en?.title ?? feature.id

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

    imageCtx.resetImages()
    await imageCtx.refreshImages()
    cardCtx.setMode(FeatureCardMode.Display)
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
