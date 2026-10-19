<script lang="ts">
// BITS
import { SimpleTooltip } from '#lib/bits/core/index.js'
// TYPES
import type { LayerPropertyCardBodyProps } from '../layerPropertyCard.types'

let {
  name = null,
  scopeLabel = null,
  scopeTone = 'project',
  iconTitle = null,
  iconComponent = null,
  class: className = '',
}: LayerPropertyCardBodyProps = $props()

const IconComponent = $derived(iconComponent)
</script>

<div class={`min-w-0 flex-1 ${className}`}>
  <h3 class="break-words text-[15px] font-semibold leading-5">{name || '-'}</h3>
  <div class="mt-1.5 flex flex-wrap items-center gap-2">
    {#if IconComponent}
      <SimpleTooltip disabled={!iconTitle}>
        {#snippet trigger()}
          <span
            class={`bits-form__layer-card-type-icon-wrap bits-form__layer-card-type-icon-wrap--${scopeTone}`}
          >
            <IconComponent class="bits-form__layer-card-type-icon" />
          </span>
        {/snippet}
        {iconTitle ?? ''}
      </SimpleTooltip>
    {/if}
    {#if scopeLabel}
      <span
        class={`bits-form__layer-card-scope bits-form__layer-card-scope--${scopeTone}`}
      >
        {scopeLabel}
      </span>
    {/if}
  </div>
</div>
