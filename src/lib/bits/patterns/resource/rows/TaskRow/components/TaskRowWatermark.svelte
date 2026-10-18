<script lang="ts">
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'

let {
  typeDisplay,
  colorSuffix,
  message = '',
  reviewActionDisplay = '',
}: {
  typeDisplay: string
  colorSuffix: 'error' | 'info' | 'ok' | 'base'
  message?: string
  reviewActionDisplay?: string
} = $props()
</script>

<div class={`bits-task-row__watermark bits-task-row__watermark--${colorSuffix}`.trim()}>
  <SimpleTooltip disabled={!message} triggerProps={{ tabindex: -1 }}>
    {#snippet trigger()}
      <div class="text-center">
        <span class="bits-task-row__watermark-text">{typeDisplay}</span>
      </div>
    {/snippet}
    {message}
  </SimpleTooltip>
</div>

<div class={`bits-task-row__review bits-task-row__review--${colorSuffix}`.trim()}>
  {#if reviewActionDisplay}
    <span class="flex items-center gap-2">
      <ChevronRightIcon class="bits-task-row__review-icon" />
      {reviewActionDisplay}
    </span>
  {/if}
</div>
