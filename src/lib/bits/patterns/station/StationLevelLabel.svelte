<script lang="ts">
// COMPONENTS
import TrainIcon from 'virtual:icons/tabler/train'
import LayersIcon from 'virtual:icons/proicons/layers'
// TYPES
import type { LevelOption } from '#lib/indoor/levels.js'
let { option }: { option: LevelOption } = $props()
</script>
<span class="flex min-w-0 items-center gap-2">
  {#if option.kind === 'platform'}
    <TrainIcon class="size-5 shrink-0" aria-hidden="true" />
  {:else if option.kind === 'exit'}
    <svg
      class="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M13 4H4v16h9M10 12h11m-4-4 4 4-4 4" />
    </svg>
  {:else if option.kind === 'concourse'}
    <svg
      class="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M3 20V7l9-4 9 4v13M3 9h18M7 13v7m5-7v7m5-7v7" />
    </svg>
  {:else}
    <LayersIcon class="size-5 shrink-0" aria-hidden="true" />
  {/if}
  <span class="min-w-0 whitespace-normal">{option.floor ?? ''}</span>
</span>
