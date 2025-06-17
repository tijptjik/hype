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

// Get specifier properties from the active layer
const specifierProperties = $derived(() => {
  // Get the active layer from admin context
  const activeLayerId = adminCtx.state?.active?.layer?.ref;
  if (!activeLayerId) return [];
  
  const layer = adminCtx.cache?.layer?.get(activeLayerId);
  if (!layer?.properties) return [];
  
  // Filter for specifier type properties that are visible
  return layer.properties
    .map(layerProp => {
      const property = adminCtx.cache?.property?.get(layerProp.propertyId);
      return property && property.type === 'specifier' && layerProp.isVisible 
        ? property 
        : null;
    })
    .filter((prop): prop is Property => prop !== null);
});
</script>

{#if specifierProperties.length > 0}
  <div class="flex flex-wrap gap-3">
    {#each specifierProperties as property (property.id)}
      {@const currentValue = getSimpleFilterState(adminCtx, property.id)}
      <div class="group flex flex-col items-center gap-[8px] tracking-widest">
        <label class="text-xs uppercase leading-none text-base-content/70">
          {property.i18n?.[currentLocale]?.label || property.key}
          {#if property.isTranslatable}
            <span class="text-[10px] opacity-60">(i18n)</span>
          {/if}
        </label>
        <div class="flex items-center gap-2">
          <span
            onclick={() => handleLabelClick(adminCtx, 'properties', false, property.id)}
            class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
            Not
          </span>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            checked={currentValue === true}
            indeterminate={currentValue === null}
            onchange={(e) => handleToggleClick(adminCtx, 'properties', e, property.id)} />
          <span
            onclick={() => handleLabelClick(adminCtx, 'properties', true, property.id)}
            class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
            Only
          </span>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="text-xs text-base-content/60">
    No specifier properties available for current layer
  </div>
{/if} 