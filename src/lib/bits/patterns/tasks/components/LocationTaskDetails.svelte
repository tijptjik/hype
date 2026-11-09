<script lang="ts">
// API
import { getFeatureLocation } from '#lib/api/location.remote.js'
// COMPONENTS
import LocationCorrectionWorkspace from '../../revisionHistory/LocationCorrectionWorkspace.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import LocationReviewSection from '../../forms/featureLocation/LocationReviewSection.svelte'
import LocationIdentityReviewSection from '../../forms/featureLocation/LocationIdentityReviewSection.svelte'
import LocationTaskPreview from '../../forms/featureLocation/LocationTaskPreview.svelte'
import FormSurface from '../../forms/formSurface/FormSurface.svelte'
import LocationRematchStatus from '../../forms/featureLocation/LocationRematchStatus.svelte'
// TYPES
import type {
  LocationReviewPresentation,
  LocationReviewActions,
} from '#lib/locations/reviewPresentation.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'

let {
  task,
  loading = false,
  onCommitted,
  onActionsChange,
  onPresentationChange,
}: {
  task: Task | null
  loading?: boolean
  onCommitted: () => Promise<void>
  onActionsChange: LocationReviewActions
  onPresentationChange: (value: LocationReviewPresentation | null) => void
} = $props()
const source = $derived(task?.locationTask)
const accepted = $derived(
  source && !source.mock && task?.featureId
    ? getFeatureLocation({ featureId: task.featureId })
    : null,
)
</script>

{#if loading}
  <div role="status" class="min-h-[200px] space-y-4 p-6">
    <Skeleton class="h-5 w-40" /><Skeleton class="h-11 w-full" />
    <Skeleton class="h-5 w-1/2" />
  </div>
{:else if task?.feature && task.featureId}
  {#key task.id}
    <FormSurface>
      {#if source?.mock}
        <LocationTaskPreview
          surface="editor"
          selection={source.kind}
          featureId={task.featureId}
        />
      {:else if source?.rematchJobId}
        <LocationRematchStatus
          locationId={source.locationId}
          jobId={source.rematchJobId}
          status={source.rematchStatus ?? 'pending'}
          reason={source.rematchReason}
          {onCommitted}
        />
      {:else if source?.correctionProposalId}
        <LocationCorrectionWorkspace
          featureId={task.featureId}
          proposalId={source.correctionProposalId}
          {onCommitted}
        />
      {:else if source?.proposalId && accepted}
        {#await accepted}
          <div role="status" class="space-y-4 p-6">
            <Skeleton class="h-5 w-40" /><Skeleton class="h-11 w-full" />
          </div>
        {:then association}
          {#if association}
            <LocationReviewSection
              featureId={task.featureId}
              proposalId={source.proposalId}
              onlyGroup={source.kind === 'facts' ? 'facts' : 'location'}
              associationRevision={association.version}
              modifiedAt={task.feature.modifiedAt}
              isDirty={false}
              {onCommitted}
              {onActionsChange}
              {onPresentationChange}
            />
          {/if}
        {/await}
      {:else if source?.reviewId}
        <LocationIdentityReviewSection
          featureId={task.featureId}
          locationId={source.locationId}
          initialReviewId={source.reviewId}
          initialMergeReviewId={source.mergeReviewId}
          mergeRequired={source.kind === 'merge'}
          isDirty={false}
          {onCommitted}
          {onActionsChange}
          {onPresentationChange}
        />
      {/if}
    </FormSurface>
  {/key}
{/if}
