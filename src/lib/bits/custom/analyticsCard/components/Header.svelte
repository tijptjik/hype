<script lang="ts">
// BITS
import SimpleTooltip from '$lib/bits/core/tooltip/SimpleTooltip.svelte'
import { cx } from '$lib/bits/utils'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
// TYPES
import type { AnalyticsCardHeaderProps } from '../analyticsCard.types'

let {
  title,
  leftLabel = '',
  rightLabel = '',
  right,
  tooltip = '',
  class: className = '',
}: AnalyticsCardHeaderProps = $props()

const hasRails = $derived(Boolean(leftLabel || rightLabel || right))
</script>

<div class={cx('border-b border-white/10 pb-4', className)}>
  <div
    class={cx(
      'grid gap-3',
      hasRails
        ? 'grid-cols-1 items-start sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:items-end'
        : 'grid-cols-1',
    )}
  >
    <div class="min-w-0 justify-self-start text-left">
      {#if leftLabel}
        <p
          class="text-[10px] font-semibold uppercase tracking-[0.28em] text-foreground-alt"
        >
          {leftLabel}
        </p>
      {/if}
    </div>

    <div class={cx('min-w-0', hasRails ? 'sm:justify-self-center sm:text-center' : '')}>
      <div
        class={cx('flex items-center gap-2', hasRails ? 'sm:justify-center' : 'justify-start')}
      >
        <h2
          class="text-2xl font-semibold uppercase tracking-[0.08em] text-foreground sm:text-3xl"
        >
          {title}
        </h2>

        <SimpleTooltip disabled={!tooltip}>
          {#snippet trigger()}
            <button
              type="button"
              class="inline-flex h-6 w-6 items-center justify-center rounded-full text-foreground-alt transition hover:text-foreground"
              aria-label={`About ${title}`}
            >
              <InfoIcon class="h-3.5 w-3.5" />
            </button>
          {/snippet}
          <span class="block max-w-xs text-sm leading-5">{tooltip}</span>
        </SimpleTooltip>
      </div>
    </div>

    <div class="min-w-0 justify-self-end text-right">
      {#if right}
        <div class="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          {@render right()}
        </div>
      {:else if rightLabel}
        <p
          class="text-[11px] font-semibold uppercase tracking-[0.28em] text-foreground"
        >
          {rightLabel}
        </p>
      {/if}
    </div>
  </div>
</div>
