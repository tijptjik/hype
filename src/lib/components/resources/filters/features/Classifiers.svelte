<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getSimpleFilterState,
  toggleFilterState
} from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';
// TYPES
import type { Property } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();
const currentLocale = getLocale();

// REACTIVE PROPS
const classifierProperties = $derived.by(() => {
  const layerId = adminCtx.state.active.layer?.ref;
  if (!layerId) return [];

  const layerProps = adminCtx.cache.layerProperties.get(layerId);
  if (!layerProps) return [];

  const allProperties: Property[] = Array.from(adminCtx.cache.properties.values());

  const classifierProps = layerProps
    .filter((layerProp) => layerProp.isClassifier)
    .map((layerProp) => allProperties.find((prop) => prop.id === layerProp.propertyId))
    .filter((prop): prop is Property => !!prop);
    
  return classifierProps;
});
</script>

{#if classifierProperties.length > 0}
  <div class="flex flex-wrap gap-3">
    {#each classifierProperties as property, idx (property.id)}
      {@const currentValue = getSimpleFilterState(adminCtx, 'properties', property.id)}
      <FilterToggle
        label={property.i18n?.[currentLocale]?.label || property.key}
        {currentValue}
        {idx}
        onToggleFalse={() => toggleFilterState(adminCtx, 'properties', false, property.id)}
        onToggleTrue={() => toggleFilterState(adminCtx, 'properties', true, property.id)}
        onToggleChange={() => {
          const nextState = currentValue === null ? true : currentValue === true ? false : null;
          toggleFilterState(adminCtx, 'properties', nextState, property.id);
        }} />
    {/each}
  </div>
{:else}
  <div class="text-xs text-base-content/60">
    No categorical properties available for current layer
  </div>
{/if} 