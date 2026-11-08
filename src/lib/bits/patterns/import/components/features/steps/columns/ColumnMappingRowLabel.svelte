<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { FeatureCSVColumn } from '#lib/client/services/import/types.js'

type Props = {
  column: FeatureCSVColumn
}

let { column }: Props = $props()
</script>

<h4 class="text-sm font-medium">{column.header}</h4>
<div class="text-base-content/70 mt-1 text-xs">
  {#each column.sampleValues.slice(0, 3) as sample}
    <span class="mr-2 inline-block" data-tooltip={sample}>
      {sample.length > 25 ? `${sample.substring(0, 25)}...` : sample}
    </span>
  {/each}
</div>
{#if column.layerConstraint}
  <div class="text-info mt-1 text-xs">
    <span class="font-medium">{m.feature_import__column_layer_label()}:</span>
    {#if column.layerConstraint.type === 'all'}
      {m.feature_import__column_layer_all()}
    {:else if column.layerConstraint.type === 'multiple'}
      {column.layerConstraint.layers.join(', ')}
    {:else}
      {column.layerConstraint.layers[0]}
    {/if}
  </div>
{/if}
{#if column.extractedPropertyKey && column.modelType === 'Property'}
  <div class="text-secondary mt-1 text-xs">
    <span class="font-medium">{m.feature_import__column_property_label()}:</span>
    {column.extractedPropertyKey}
  </div>
{/if}
