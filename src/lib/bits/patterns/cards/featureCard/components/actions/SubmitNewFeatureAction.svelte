<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
import { beginCardSubmission } from '#lib/context/cardSubmission.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
// SERVICES
import { TaskSubmissionRetry } from '#lib/client/services/taskSubmissionRetry.js'
import { submitNewFeature as submitNewFeatureAPI } from '#lib/client/services/task.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { ImageUpload } from '#lib/db/zod/schema/image.types.js'
import type { NewFeatureTask } from '#lib/api/services/taskCreation.types.js'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

const submissionRetry = new TaskSubmissionRetry()
let disposed = false
let releaseSubmission: (() => void) | undefined
onDestroy(() => {
  disposed = true
  releaseSubmission?.()
  submissionRetry.clear()
})
const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const omniCtx = getOmniCtx()
const imageCtx = getImageCtx()

/** Submits a draft without letting late completion reset a newer form. @returns Submission completion. */
async function submitNewFeature(): Promise<void> {
  const newFeature = appCtx.draft.current as NewFeatureTask
  const accountRevision = appCtx.account.revision
  const resourceScope = appCtx.resources.scopeKey
  /** Whether the original draft and account still own the form. @returns Current ownership. */
  const isCurrent = (): boolean =>
    !disposed &&
    accountRevision === appCtx.account.revision &&
    resourceScope === appCtx.resources.scopeKey &&
    appCtx.draft.current === newFeature
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

  const release = beginCardSubmission(cardCtx)
  releaseSubmission = release
  try {
    cardCtx.resetError()

    if (!newFeature) return

    await submitNewFeatureAPI(newFeature, imageCtx.getStagedQueue() as ImageUpload[], {
      retry: {
        session: submissionRetry,
        scope: () =>
          JSON.stringify([appCtx.account.revision, appCtx.resources.scopeKey]),
      },
      onStatusChange: label => {
        if (isCurrent()) cardCtx.setSubmissionLabel(label)
      },
    })

    if (!isCurrent()) return
    submissionRetry.clear()
    toast.success('Submission Success', {
      description: `${title} was suggested for addition to ${layerName}.`,
    })

    imageCtx.resetImages()
    cardCtx.userData.photos = []
    cardCtx.resetError()
    // Release busy state before our own reset/close invalidates the ownership check.
    release()
    appCtx.draft.reset()
    cardCtx.setMode(FeatureCardMode.Display)
    omniCtx.close()
  } catch (error) {
    if (!isCurrent()) return
    console.error('Error submitting new feature:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    // Busy ownership is separate from permission to mutate the current form.
    release()
  }
}
</script>

<FeatureCardSubmitButton onSubmit={submitNewFeature} />
