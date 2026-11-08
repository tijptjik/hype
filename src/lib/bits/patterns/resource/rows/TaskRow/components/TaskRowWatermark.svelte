<script lang="ts">
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import { m } from '#lib/i18n.js'
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'

let {
  typeDisplay,
  isMock = false,
  colorSuffix,
  message = '',
  reviewActionDisplay = '',
}: {
  typeDisplay: string
  isMock?: boolean
  colorSuffix: 'error' | 'info' | 'ok' | 'base' | 'warning'
  message?: string
  reviewActionDisplay?: string
} = $props()
</script>

<div
  class="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-2 pb-2 pl-20 @min-[48rem]:col-start-2 @min-[48rem]:row-start-1 @min-[48rem]:flex-col @min-[48rem]:items-start @min-[48rem]:p-0"
>
  <SimpleTooltip
    disabled={!message || message === typeDisplay}
    triggerProps={{ tabindex: -1 }}
    triggerClass="min-w-0 max-w-full"
  >
    {#snippet trigger()}
      <span
        class={`inline-flex max-w-full rounded-md border px-2 py-1 text-left text-xs font-medium break-words whitespace-normal ${
          colorSuffix === 'error'
            ? 'border-error/25 bg-error/10 text-error'
            : colorSuffix === 'warning'
              ? 'border-warning/25 bg-warning/10 text-warning'
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
  {#if isMock}
    <span
      class="border-border text-muted-foreground rounded-md border px-2 py-1 text-xs"
      >{m.location_task_mock()}</span
    >
  {/if}
  {#if reviewActionDisplay}
    <span class="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
      <ChevronRightIcon class="size-3 shrink-0" />
      {reviewActionDisplay}
    </span>
  {/if}
</div>
