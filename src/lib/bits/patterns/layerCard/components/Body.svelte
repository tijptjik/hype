<script lang="ts">
import type { LayerCardBodyProps } from '../layerCard.types'

let { name = null, code = null, class: className = '' }: LayerCardBodyProps = $props()
</script>

<div class={`bits-form__layer-card-body ${className}`}>
  <span class="bits-form__layer-card-body-name">{name || '-'}</span>
  <span class="bits-form__layer-card-body-code">{code || '-'}</span>
</div>
