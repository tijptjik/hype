<script lang="ts">
import { SimpleTooltip } from '$lib/bits'
import type { FeatureStatPipsProps } from '../featureStats.types'

let { title, icon, statuses, showTitle = true }: FeatureStatPipsProps = $props()
</script>

<div class="bits-theme bits-feature-stat">
  <span class="bits-feature-stat__title">
    {#if showTitle}
      <span class="bits-feature-stat__title-text">{title}</span>
      {#if icon}
        {@const IconComponent = icon}
        <span class="bits-feature-stat__title-icon">
          <IconComponent class="bits-feature-stat__icon-svg" />
        </span>
      {/if}
    {:else if icon}
      {@const IconComponent = icon}
      <IconComponent class="bits-feature-stat__icon-svg" />
    {/if}
  </span>

  <div class="bits-feature-stat__pips">
    {#each Object.entries(statuses) as [ label, status ]}
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
