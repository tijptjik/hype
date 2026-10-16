<script lang="ts">
// ICONS
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'
// BITS
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { Snippet } from 'svelte'

let {
  title,
  count,
  collapsed = false,
  onCollapsedChange,
  children,
  class: className = '',
}: {
  title: string
  count?: string
  collapsed?: boolean
  onCollapsedChange: (collapsed: boolean) => void
  children: Snippet
  class?: string
} = $props()

const contentId = $props.id()
</script>

<section class={cx('min-w-0 border-b border-border/40 last:border-b-0', className)}>
  <h3>
    <button
      type="button"
      class="flex min-h-12 w-full cursor-pointer items-center gap-3 bg-primary/3 px-6 py-3 text-left text-foreground transition-colors hover:bg-primary/8 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      aria-expanded={!collapsed}
      aria-controls={contentId}
      onclick={() => onCollapsedChange(!collapsed)}
    >
      <ChevronRightIcon
        class={cx(
          'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
          !collapsed && 'rotate-90',
        )}
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 break-words text-sm font-semibold">{title}</span>
      {#if count}
        <span class="shrink-0 text-xs font-normal text-muted-foreground">{count}</span>
      {/if}
    </button>
  </h3>
  <div id={contentId} hidden={collapsed}>
    {@render children()}
  </div>
</section>
