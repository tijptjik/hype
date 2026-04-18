<script lang="ts">
import { cx } from '$lib/bits/utils'
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
    'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] py-4',
    className,
  )}
>
  {#if title}
    <h3
      class="px-4 pb-3 text-center text-sm font-semibold uppercase tracking-[0.24em] text-white/55"
    >
      {title}
    </h3>
  {/if}

  {#if visibleItems.length > 0}
    <div class="flex min-h-0 flex-wrap gap-2 overflow-auto px-4">
      {#each visibleItems as item (`${item.label}:${item.value}`)}
        <div
          class="min-w-[8.5rem] flex-1 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2"
        >
          <div class="font-mono text-xsm uppercase tracking-[0.22em] text-white/45">
            {item.label}
          </div>
          <div class="text-md leading-6 text-white/88">{item.value}</div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="px-4 py-2 text-center text-sm text-white/45">{emptyLabel}</div>
  {/if}
</section>
