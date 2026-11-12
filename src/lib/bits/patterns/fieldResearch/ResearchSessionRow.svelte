<script lang="ts">
// DATES
import { formatDistanceToNowStrict } from 'date-fns'
// BITS
import Row from '#lib/bits/custom/rows/Row.svelte'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
// ICONS
import CheckIcon from 'virtual:icons/proicons/checkmark'
import LayersIcon from 'virtual:icons/proicons/layers'
// TYPES
import type { ResearchSessionIndexRow } from '#lib/fieldResearch/model.js'

let {
  session,
  index,
  disabled = false,
  selected = false,
  onopen,
}: {
  session: ResearchSessionIndexRow
  index: number
  selected?: boolean
  disabled?: boolean
  onopen: () => void
} = $props()

const creator = $derived(session.creatorName || 'Unknown creator')
const date = $derived(new Date(session.createdAt))
</script>

<Row
  {index}
  isSelected={selected}
  entityId={session.id}
  isFocusable={!disabled}
  class="grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-2 py-2 pr-4 @[720px]:grid-cols-[4rem_minmax(0,1fr)_minmax(8rem,0.6fr)_8rem]"
  onclick={() => {
    if (!disabled) onopen()
  }}
  onkeydown={event => {
    if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onopen()
    }
  }}
>
  <div
    class="bg-base-200/60 text-primary flex size-16 items-center justify-center rounded-md"
    aria-hidden="true"
  >
    {#if selected}
      <CheckIcon class="size-7" />
    {:else}
      <LayersIcon class="size-7" />
    {/if}
  </div>
  <div class="min-w-0 space-y-1">
    <p class="leading-snug font-semibold break-words whitespace-normal">
      {session.name}
    </p>
    <p class="text-base-content/65 text-sm break-words whitespace-normal">
      {session.layerName || 'No layer selected'}
      <span aria-hidden="true"> · </span>
      {session.photoCount} {session.photoCount === 1 ? 'photo' : 'photos'}
      <span aria-hidden="true"> · </span>
      {session.stackCount} {session.stackCount === 1 ? 'stack' : 'stacks'}
    </p>
  </div>
  <section
    class="col-start-2 flex min-w-0 items-center gap-2 @[720px]:col-start-auto"
    aria-label={`Created by ${creator}`}
  >
    <Avatar name={creator} src={session.creatorImage} class="size-8" />
    <span class="text-sm break-words whitespace-normal">{creator}</span>
  </section>
  <div class="col-start-2 space-y-1 @[720px]:col-start-auto @[720px]:text-right">
    <time
      datetime={session.createdAt}
      class="text-base-content/65 block text-sm"
      title={`Created ${date.toLocaleString()}`}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
    <span class="text-base-content/50 text-xs">
      {session.isArchived
        ? 'Archived'
        : session.status === 'completed'
          ? 'Completed'
          : 'In progress'}
    </span>
  </div>
</Row>
