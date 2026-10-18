<script lang="ts">
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import type { FeatureStatPipsProps } from '../featureStats.types'

let { title, icon, statuses, showTitle = true }: FeatureStatPipsProps = $props()
</script>

<div class="bits-theme bits-feature-stat">
  <span class="text-xs leading-4 text-base-content/60">
    {#if showTitle}
      <span class="bits-feature-stat__title-text">{title}</span>
      {#if icon}
        {@const IconComponent = icon}
        <span class="bits-feature-stat__title-icon">
          <IconComponent class="w-4 h-4" />
        </span>
      {/if}
    {:else if icon}
      {@const IconComponent = icon}
      <IconComponent class="w-4 h-4" />
    {/if}
  </span>

  <div class="flex gap-1.5">
    {#each Object.entries(statuses) as [label, status]}
      <SimpleTooltip>
        {#snippet trigger()}
          <div
            class={`bits-feature-stat__pip ${
              status === true
                ? 'bits-feature-stat__pip--ok'
                : status === false
                  ? 'bits-feature-stat__pip--error'
                  : 'bits-feature-stat__pip--pending'
            }`}
          ></div>
        {/snippet}
        {label}
      </SimpleTooltip>
    {/each}
  </div>
</div>
