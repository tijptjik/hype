<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { TaskFieldsProps } from '../task.types'

let {
  title,
  items,
  emptyLabel = '-',
  class: className = '',
}: TaskFieldsProps = $props()

const visibleItems = $derived(items.filter(item => item.value.trim().length > 0))
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

  {#if visibleItems.length > 0}
    <div class="flex min-h-0 flex-wrap gap-2 overflow-auto px-4">
      {#each visibleItems as item (`${item.label}:${item.value}`)}
        <div
          class="min-w-[8.5rem] flex-1 rounded-xl border border-foreground/8 bg-foreground/[0.04] px-3 py-2"
        >
          <div class="text-xs font-semibold text-muted-foreground">
            {item.label}
          </div>
          <div class="text-sm leading-6 text-foreground">{item.value}</div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="px-4 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
  {/if}
</section>
