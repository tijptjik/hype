<script lang="ts">
// I18N
import { getI18nValue } from '$lib/i18n';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// CONSTANTS
const PROPERTY_PRIORITY = {
  graphemes: 1,
  size: 2,
  visibility: 3,
  material: 4,
  calligrapher: 5
} as const;

// FUNCTIONS
// Sort properties by predefined priority, then alphabetically
const sortedProperties = $derived(
  [...feature.properties].sort((a, b) => {
    // Get priority values (default to Infinity for non-priority properties)
    const priorityA =
      PROPERTY_PRIORITY[a.property.key as keyof typeof PROPERTY_PRIORITY] ?? Infinity;
    const priorityB =
      PROPERTY_PRIORITY[b.property.key as keyof typeof PROPERTY_PRIORITY] ?? Infinity;

    // First sort by priority
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Then sort alphabetically by label
    return (a.property.label ?? '').localeCompare(b.property.label ?? '');
  })
);
</script>

<div
  class="pointer-events-auto flex h-48 flex-col gap-2 overflow-y-auto pl-3 pr-0 w-100:pl-6">
  {#each sortedProperties as property}
    {#if property.property.key === 'grade' || property.property.key === 'calligrapher'}
      <!-- TODO Ignore grade property -->
    {:else}
      <div class="flex max-h-24 flex-col overflow-y-auto">
        <span class="text-xs font-normal uppercase tracking-wide text-gray-400">
          {getI18nValue(property.property, 'label')}
        </span>
        <span class="font-medium">
          {getI18nValue(property, 'value') || '-'}
        </span>
      </div>
    {/if}
  {/each}
</div>
