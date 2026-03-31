<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { Snippet } from 'svelte'
import type { TaskDescriptorsProps } from '../task.types'

let {
  title,
  items,
  class: className = '',
  children,
}: TaskDescriptorsProps & { children?: Snippet } = $props()

function getDisplayValue(value: string): string {
  console.log('VALUE', value)
  return value.trim().length > 0 ? value : '-'
}
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

  <div class="flex min-h-0 flex-col gap-4 overflow-auto">
    {#each items as item (`${item.label}:${item.value}`)}
      <div class="flex flex-col gap-0 px-4">
        <div class="font-mono text-sm uppercase tracking-[0.22em] text-white/45">
          {item.label}
        </div>
        <div
          class={cx('text-md leading-6 text-white/88', item.wrap ? 'whitespace-pre-wrap' : 'truncate')}
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
