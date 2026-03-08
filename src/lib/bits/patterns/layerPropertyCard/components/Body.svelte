<script lang="ts">
import type { LayerPropertyCardBodyProps } from '../layerPropertyCard.types'

let {
  name = null,
  scopeLabel = null,
  scopeTone = 'project',
  class: className = '',
}: LayerPropertyCardBodyProps = $props()
</script>

<div class={`bits-form__layer-card-body ${className}`}>
  <span class="bits-form__layer-card-body-name">{name || '-'}</span>
  {#if scopeLabel}
    <span
      class={`bits-form__layer-card-scope bits-form__layer-card-scope--${scopeTone}`}
    >
      {scopeLabel}
    </span>
  {/if}
</div>
