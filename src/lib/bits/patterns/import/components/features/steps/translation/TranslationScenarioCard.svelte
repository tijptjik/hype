<script lang="ts">
// COMPONENTS
import Badge from '$lib/bits/custom/badge/Badge.svelte'
// TYPES
import type { FeatureTranslationScenarioSummary } from '$lib/client/services/import/features/translation'

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
  class={`flex min-h-48 flex-col justify-between rounded-3xl border bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl ${accentClass}`}
>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-base-content/45">
          Scenario {summary.scenario}
        </p>
        <h4 class="mt-1 text-xl font-black tracking-tight text-base-content">
          {summary.title}
        </h4>
      </div>
      <div class="font-mono text-4xl font-black leading-none text-base-content/85">
        {summary.count}
      </div>
    </div>

    <p class="text-sm leading-relaxed text-base-content/60">
      {summary.description}
    </p>
    {#if summary.directions.length > 0}
      <div class="flex flex-col -gap-1">
        {#each summary.directions as direction}
          <div
            class="px-1 py-1 font-mono text-[11px] tracking-[0.12em] text-base-content/60"
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
