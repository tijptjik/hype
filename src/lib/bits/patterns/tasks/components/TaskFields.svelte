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
      class="border-border text-foreground mb-4 border-b px-4 py-3 text-sm font-semibold"
    >
      {title}
    </h3>
  {/if}

  {#if visibleItems.length > 0}
    <div class="flex min-h-0 flex-wrap gap-2 overflow-auto px-4">
      {#each visibleItems as item (`${item.label}:${item.value}`)}
        <div
          class="border-foreground/8 bg-foreground/[0.04] min-w-[8.5rem] flex-1 rounded-xl border px-3 py-2"
        >
          <div class="text-muted-foreground text-xs font-semibold">
            {item.label}
          </div>
          <div class="text-foreground text-sm leading-6">{item.value}</div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-muted-foreground px-4 py-2 text-sm">{emptyLabel}</div>
  {/if}
</section>
