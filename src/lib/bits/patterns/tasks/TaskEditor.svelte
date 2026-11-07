<script lang="ts">
// COMPONENTS
import TaskReviewLayout from './components/TaskReviewLayout.svelte'
import TaskReviewDetails from './components/TaskReviewDetails.svelte'
import TaskReviewImages from './components/TaskReviewImages.svelte'
import TaskMap from './components/TaskMap.svelte'
import LocationTaskDetails from './components/LocationTaskDetails.svelte'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
// TYPES
import type { TaskEditorProps } from './task.types'
import type {
  LocationReviewPresentation,
  LocationReviewActions,
} from '#lib/locations/reviewPresentation.js'

let {
  task,
  previewTask,
  loading = false,
  onLocationActionsChange,
  onLocationCommitted,
  ...props
}: TaskEditorProps & {
  previewTask?: TaskEditorProps['task']
  loading?: boolean
  onLocationActionsChange?: LocationReviewActions
  onLocationCommitted?: () => Promise<void>
} = $props()
// All review maps follow the user's effective map preference, including independent styles.
const theme = getThemeModel()
const displayTask = $derived(task ?? previewTask)
const type = $derived(displayTask?.type)
const photoOnly = $derived(type === 'newPhoto')
const location = $derived(Boolean(type?.startsWith('location')))
let presentation = $state<LocationReviewPresentation | null>(null)
const comparison = $derived(
  presentation?.before && presentation.after
    ? {
        before: presentation.before.geometry.coordinates,
        after: presentation.after.geometry.coordinates,
      }
    : null,
)
const geometry = $derived(
  displayTask?.creationProposal?.content.placement.geometry ??
    displayTask?.feature?.geometry,
)
const coordinates = $derived(
  comparison?.before ??
    (geometry?.type === 'Point' ? (geometry.coordinates as [number, number]) : null),
)
const addressMeta = $derived(
  displayTask?.creationProposal?.content.placement.addressMeta ??
    displayTask?.feature?.addressMeta ??
    null,
)
$effect(() => {
  displayTask?.id
  presentation = null
})
</script>

<TaskReviewLayout
  {type}
  {photoOnly}
  {loading}
  class={props.class}
  contributorId={type === 'reportedMissing'
    ? displayTask?.contributorId
    : (displayTask?.feature?.contributorId ?? displayTask?.contributorId)}
  createdAt={displayTask?.createdAt}
>
  {#snippet map()}
    {#if !location}
      <TaskMap
        {coordinates}
        addressMeta={null}
        mapStyleCode={theme.resolvedMapStyle}
        loading={loading && !coordinates}
        initialZoom={11}
        showFullscreen={false}
        label="Location context map"
        class="border-border/40 h-32 min-h-0! flex-none! border-b"
      />
    {/if}
    <TaskMap
      {coordinates}
      {addressMeta}
      {comparison}
      mapStyleCode={theme.resolvedMapStyle}
      loading={loading && !coordinates}
      showFullscreen={false}
      expandOnClick
      class="min-h-0!"
    />
  {/snippet}
  {#snippet image()}
    <TaskReviewImages {task} {previewTask} {photoOnly} {location} {...props} />
  {/snippet}
  {#snippet details()}
    {#if location}
      <div class="min-h-[200px] shrink-0" data-task-review-details>
        <LocationTaskDetails
          {task}
          {loading}
          onPresentationChange={value => (presentation = value)}
          onActionsChange={onLocationActionsChange ?? (() => {})}
          onCommitted={onLocationCommitted ?? (async () => {})}
        />
      </div>
    {:else if !photoOnly}
      <TaskReviewDetails task={displayTask ?? null} {type} {loading} {...props} />
    {/if}
  {/snippet}
</TaskReviewLayout>
