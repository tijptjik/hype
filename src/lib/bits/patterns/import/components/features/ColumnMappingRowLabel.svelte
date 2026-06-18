<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { FeatureCSVColumn } from '$lib/client/services/import/types'

type Props = {
  column: FeatureCSVColumn
}

let { column }: Props = $props()
</script>

<h4 class="text-sm font-medium">{column.header}</h4>
<div class="mt-1 text-xs text-base-content/70">
  {#each column.sampleValues.slice(0, 3) as sample}
    <span class="mr-2 inline-block" title={sample}>
      {sample.length > 25 ? `${sample.substring(0, 25)}...` : sample}
    </span>
  {/each}
</div>
{#if column.layerConstraint}
  <div class="mt-1 text-xs text-info">
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
  <div class="mt-1 text-xs text-secondary">
    <span class="font-medium">{m.feature_import__column_property_label()}:</span>
    {column.extractedPropertyKey}
  </div>
{/if}
