<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
// COMPONENTS
import ImportHeaderStats from './ImportHeaderStats.svelte'
// TYPES
import type { ImportHeaderProps } from './importLayout.types'

let {
  title,
  subtitle,
  dataLabel = '',
  stats = [],
  statsAction,
  progressValue = null,
  class: className = '',
}: ImportHeaderProps = $props()

const normalizedProgress = $derived(
  progressValue == null ? null : Math.max(0, Math.min(100, progressValue)),
)
const rootClass = $derived(
  cx('relative flex-none border-b border-base-content/10 px-5 py-4', className),
)
</script>

<div class={rootClass}>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0 flex-1">
      <h2 class="text-base-content text-2xl leading-tight font-black tracking-tight">
        {title}
      </h2>
      {#if subtitle}
        <p class="text-base-content/75 mt-2 max-w-4xl text-sm leading-relaxed">
          {subtitle}
        </p>
      {/if}
    </div>

    {#if dataLabel}
      <div
        class="border-base-content/10 bg-base-100/60 text-base-content/65 rounded-lg border px-3 py-2 font-mono text-xs tracking-[0.18em] uppercase"
      >
        {dataLabel}
      </div>
    {/if}
  </div>

  <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <ImportHeaderStats {stats} />

    {#if statsAction}
      <div class="flex justify-start md:justify-end">
        {@render statsAction()}
      </div>
    {/if}
  </div>

  {#if normalizedProgress !== null}
    <div class="bg-base-content/10 absolute inset-x-0 bottom-0 h-px">
      <div
        class="bg-primary h-full transition-[width] duration-200"
        style={`width:${normalizedProgress}%`}
      ></div>
    </div>
  {/if}
</div>
