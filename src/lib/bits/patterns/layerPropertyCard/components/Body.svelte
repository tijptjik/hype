<script lang="ts">
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

<div class={`bits-form__layer-card-body ${className}`}>
  <span class="bits-form__layer-card-body-name">{name || '-'}</span>
  <div class="bits-form__layer-card-meta">
    {#if IconComponent}
      <span
        class={`bits-form__layer-card-type-icon-wrap bits-form__layer-card-type-icon-wrap--${scopeTone}`}
        title={iconTitle ?? undefined}
        aria-label={iconTitle ?? undefined}
      >
        <IconComponent class="bits-form__layer-card-type-icon" />
      </span>
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
