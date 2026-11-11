<script lang="ts">
// ICONS
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { Snippet } from 'svelte'

let {
  title,
  loading = false,
  count,
  collapsed = false,
  onCollapsedChange,
  children,
  class: className = '',
}: {
  title: string
  loading?: boolean
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
      class="bg-primary/3 text-foreground hover:bg-primary/8 focus-visible:outline-primary flex min-h-12 w-full cursor-pointer items-center gap-3 px-6 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
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
      <span class="relative min-w-0 flex-1 text-sm font-semibold break-words"
        >{#if loading}
          <span class="invisible">{title}</span>
          <Skeleton
            class="absolute top-1/2 left-0 h-4 w-48 max-w-full -translate-y-1/2"
          />
        {:else}
          {title}
        {/if}</span
      >
      {#if count}
        <span class="text-muted-foreground shrink-0 text-xs font-normal"
          >{#if loading}
            <Skeleton class="h-4 w-12" />
          {:else}
            {count}
          {/if}</span
        >
      {/if}
    </button>
  </h3>
  <div id={contentId} hidden={collapsed}>
    {@render children()}
  </div>
</section>
