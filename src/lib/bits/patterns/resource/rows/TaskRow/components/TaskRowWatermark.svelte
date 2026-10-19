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

<div
  class="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-2 pb-2 pl-20 @min-[48rem]:col-start-2 @min-[48rem]:row-start-1 @min-[48rem]:flex-col @min-[48rem]:items-start @min-[48rem]:p-0"
>
  <SimpleTooltip disabled={!message} triggerProps={{ tabindex: -1 }}>
    {#snippet trigger()}
      <span
        class={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${
          colorSuffix === 'error'
            ? 'border-error/25 bg-error/10 text-error'
            : colorSuffix === 'info'
              ? 'border-info/25 bg-info/10 text-info'
              : colorSuffix === 'ok'
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-border bg-surface text-foreground'
        }`}
      >
        {typeDisplay}
      </span>
    {/snippet}
    {message}
  </SimpleTooltip>
  {#if reviewActionDisplay}
    <span class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <ChevronRightIcon class="size-3 shrink-0" />
      {reviewActionDisplay}
    </span>
  {/if}
</div>
