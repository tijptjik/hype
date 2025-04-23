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
  class="justify-flex-start pointer-events-auto flex h-48 flex-wrap items-center gap-2 overflow-y-auto overscroll-contain pl-3 pr-0 w-100:pl-6 w-120:gap-4">
  {#each sortedProperties.filter((p) => p.property.key !== 'grade' && (p.value ? p.value : p.propertyValue?.value) !== undefined) as property}
    <div class="flex max-h-24 min-w-24 flex-col justify-evenly">
      <span class="font-mono text-xs font-normal uppercase tracking-wide text-gray-400">
        {getI18nValue(property.property, 'label')}
      </span>
      <span class="overflow-y-auto overscroll-contain font-medium">
        {getI18nValue(property.value ? property : property.propertyValue, 'value') ||
          '-'}
      </span>
    </div>
  {/each}
</div>
