<script lang="ts">
// SVELTE
import { onDestroy, tick } from 'svelte'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
import { beginCardSubmission } from '#lib/context/cardSubmission.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
// SERVICES
import { TaskSubmissionRetry } from '#lib/client/services/taskSubmissionRetry.js'
import { submitMissingReport as submitMissingReportAPI } from '#lib/client/services/task.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
// LOCAL
import FeatureCardSubmitButton from './FeatureCardSubmitButton.svelte'

let { feature }: { feature: Feature } = $props()

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
const imageCtx = getImageCtx()
const featureTitle = $derived(
  feature.i18n?.[getLocaleKey()]?.title ?? feature.i18n?.en?.title ?? feature.id,
)

/** Submits only while hierarchy preflight still belongs to this account and feature. @returns Submission completion. */
async function handleSubmitMissingReport(): Promise<void> {
  if (imageCtx.getStagedQueue().length === 0) {
    cardCtx.setError(m.validation__at_least_one_image())
    return
  }

  if (cardCtx.userData.missingReason.trim().length < 5) {
    cardCtx.validationError = m.validation__at_least_five_characters()
    return
  }

  const accountRevision = appCtx.account.revision
  const resourceScope = appCtx.resources.scopeKey
  const submittedFeatureId = feature.id
  /** Whether this action still owns the visible form. @returns Current ownership. */
  const isCurrent = (): boolean =>
    !disposed &&
    accountRevision === appCtx.account.revision &&
    resourceScope === appCtx.resources.scopeKey &&
    submittedFeatureId === feature.id

  const release = beginCardSubmission(cardCtx)
  releaseSubmission = release
  try {
    cardCtx.resetError()

    const { layer, project, organisation } = await appCtx.getHierarchy(feature)
    // Hierarchy lookup must not move the original action into a newer account or feature.
    if (!isCurrent()) return
    if (!layer || !project || !organisation) {
      throw new Error('Unable to resolve submission hierarchy')
    }

    await submitMissingReportAPI(
      feature,
      layer,
      project,
      organisation,
      cardCtx.userData.missingReason,
      imageCtx.getStagedQueue(),
      {
        retry: {
          session: submissionRetry,
          scope: () =>
            JSON.stringify([appCtx.account.revision, appCtx.resources.scopeKey]),
        },
        onStatusChange: label => {
          if (isCurrent()) cardCtx.setSubmissionLabel(label)
        },
      },
    )
    if (!isCurrent()) return
    submissionRetry.clear()
    cardCtx.userData.missingReason = ''
    cardCtx.resetError()
    await tick()
    if (!isCurrent()) return
    // Persistence already succeeded; a read failure must not make the contribution retryable.
    try {
      await imageCtx.refreshImages()
    } catch (refreshError) {
      console.error('Contribution saved, but image refresh failed:', refreshError)
    }
    if (!isCurrent()) return
    imageCtx.cleanupStagedImages()
    imageCtx.resetUploadQueue()
    imageCtx.resetTargetImage()
    imageCtx.resetActivePreview()
    cardCtx.setMode(FeatureCardMode.Display)
    toast.success(m.report_missing__success(), {
      description: m.report_missing__submitted_description({
        featureTitle,
      }),
    })
  } catch (error) {
    if (!isCurrent()) return
    console.error('Error submitting missing report:', error)
    toast.error(m.long_crazy_peacock_care())
    cardCtx.validationError = m.long_crazy_peacock_care()
  } finally {
    // Busy ownership is separate from permission to mutate the current form.
    release()
  }
}
</script>

<FeatureCardSubmitButton onSubmit={handleSubmitMissingReport} variant="secondary" />
