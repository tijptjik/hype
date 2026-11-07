<script lang="ts">
// COMPONENTS
import ImageEditor from '#lib/bits/patterns/images/ImageEditor.svelte'
import TaskImageReview from './TaskImageReview.svelte'
import TaskImageEditor from './TaskImageEditor.svelte'
// SERVICES
import { getURLfromImage } from '#lib/client/services/image.js'
// TYPES
import type { TaskEditorProps } from '../task.types'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

let {
  task,
  previewTask,
  photoOnly = false,
  location = false,
  localeState,
  onLocaleStateChange,
  onImageReviewChange,
  onImageAcceptActionChange,
  onImagesAccepted,
}: TaskEditorProps & {
  previewTask?: TaskEditorProps['task']
  photoOnly?: boolean
  location?: boolean
} = $props()
let width = $state(0)
const layout = $derived(photoOnly ? (width < 640 ? 'bottom' : 'sidebar') : 'top')
const pendingItemCount = $derived((task ?? previewTask)?.images?.length ?? 0)
const reviewed = $derived(Boolean(task?.isReviewed))
const revisionReview = $derived(
  task?.revisionReviewRequired &&
    (photoOnly || (task.type === 'newFeature' && !task.identityTransferred)),
)
const locationItems = $derived(
  location && task
    ? (task.images ?? []).map(attachment => ({
        id: attachment.imageId,
        src: getURLfromImage({
          image: attachment as unknown as ImageCtxEnvelope,
          transformation: 'c_limit,w_1600',
        }),
      }))
    : [],
)
</script>

<div
  bind:clientWidth={width}
  class="flex h-full min-h-0 flex-1 flex-col"
  data-task-gallery
>
  {#if photoOnly && task?.identityTransferred && !reviewed}
    <div class="border-border grid gap-2 border-b p-4 text-sm">
      <p>
        This task was reassigned in a reviewed merge or split. Its original evidence and
        contributor are retained.
      </p>
    </div>
  {/if}
  {#if photoOnly &&
    task &&
    !task.revisionReviewRequired &&
    !task.images?.length &&
    !reviewed}
    <p role="status" class="border-border text-warning border-b p-4 text-sm">
      This task has no attached photo submission. The gallery below contains existing
      Feature images only. There are no new photos to accept.
    </p>
  {/if}
  {#if !task || location}
    <ImageEditor
      items={locationItems}
      isLoading={!task}
      {pendingItemCount}
      {layout}
      isReadonly
      showNavButtons={false}
    />
  {:else if revisionReview}
    {#key task.id}
      <TaskImageReview
        taskId={task.id}
        projectId={task.projectId}
        initialReport={!photoOnly}
        {layout}
        {pendingItemCount}
        readonly={reviewed}
        reviewAction={task.reviewAction}
        onChange={onImageReviewChange}
        onAcceptActionChange={onImageAcceptActionChange}
        onAccepted={onImagesAccepted}
      />
    {/key}
  {:else}
    <TaskImageEditor
      {layout}
      {pendingItemCount}
      multilingualExpanded={localeState?.expanded}
      onMultilingualExpandedChange={expanded => {
        if (localeState) onLocaleStateChange?.({ ...localeState, expanded })
      }}
      featureId={task.featureId ?? task.feature?.id}
      readonly={reviewed ||
        task.revisionReviewRequired ||
        task.identityTransferred ||
        (photoOnly && !task.images?.length)}
      intentReadonly={reviewed ||
        task.identityTransferred ||
        !task.featureId ||
        (photoOnly && !task.images?.length)}
      researchOutcome={task.reviewAction === 'set-intangible' &&
      task.reviewOutcome === 'accepted'
        ? 'accepted'
        : undefined}
      isReviewed={reviewed}
    />
  {/if}
</div>
