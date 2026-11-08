<script lang="ts">
// COMPONENTS
import Badge from '#lib/bits/custom/badge/Badge.svelte'
// TYPES
import type { FeatureTranslationScenarioSummary } from '#lib/client/services/import/features/translation.js'

type Props = {
  summary: FeatureTranslationScenarioSummary
}

let { summary }: Props = $props()

const tone = $derived(summary.count > 0 ? 'warning' : 'neutral')
const accentClass = $derived.by(() => {
  if (summary.scenario === 1) return 'border-info/25'
  if (summary.scenario === 2) return 'border-warning/25'
  return 'border-success/25'
})
</script>

<section
  class={`bg-panel/[0.45] flex min-h-48 flex-col justify-between rounded-3xl border p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl ${accentClass}`}
>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-base-content/45 text-xs font-bold tracking-[0.2em] uppercase">
          Scenario {summary.scenario}
        </p>
        <h4 class="text-base-content mt-1 text-xl font-black tracking-tight">
          {summary.title}
        </h4>
      </div>
      <div class="text-base-content/85 font-mono text-4xl leading-none font-black">
        {summary.count}
      </div>
    </div>

    <p class="text-base-content/60 text-sm leading-relaxed">
      {summary.description}
    </p>
    {#if summary.directions.length > 0}
      <div class="-gap-1 flex flex-col">
        {#each summary.directions as direction}
          <div
            class="text-base-content/60 px-1 py-1 font-mono text-[11px] tracking-[0.12em]"
          >
            {direction}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="mt-5 space-y-3">
    <div class="flex flex-wrap gap-2">
      <Badge text={`${summary.titleCount} title`} {tone} />
      <Badge text={`${summary.descriptionCount} description`} tone="neutral" />
    </div>
  </div>
</section>
