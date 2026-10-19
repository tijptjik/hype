<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { Snippet } from 'svelte'
import type { TaskDescriptorsProps } from '../task.types'

let {
  title,
  items,
  class: className = '',
  children,
}: TaskDescriptorsProps & { children?: Snippet } = $props()

function getDisplayValue(value: string): string {
  return value.trim().length > 0 ? value : '-'
}
</script>

<section
  class={cx(
    'flex min-h-0 flex-col overflow-hidden border-b border-border bg-panel pb-4',
    className,
  )}
>
  {#if title}
    <h3
      class="mb-4 border-b border-border px-4 py-3 text-sm font-semibold text-foreground"
    >
      {title}
    </h3>
  {/if}

  <div class="flex min-h-0 flex-col gap-4 overflow-auto">
    {#each items as item (`${item.label}:${item.value}`)}
      <div class="flex flex-col gap-1 px-4">
        <div class="text-xs font-semibold text-muted-foreground">
          {item.label}
        </div>
        <div
          class={cx(
            'text-sm leading-6 text-foreground',
            item.wrap
              ? 'whitespace-pre-wrap'
              : 'overflow-hidden text-ellipsis whitespace-nowrap',
          )}
        >
          {getDisplayValue(item.value)}
        </div>
      </div>
    {/each}

    {#if children}
      <div class="px-4 pt-1">{@render children()}</div>
    {/if}
  </div>
</section>
