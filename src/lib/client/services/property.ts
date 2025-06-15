// TYPES
import type { AppCtx } from '$lib/context/app.svelte';
import { FirstClassResource } from '$lib/enums';
import type { Property, FeatureProperty } from '$lib/types';

/**
 * Sorts properties by type (classifiers first, then specifiers) and then by rank.
 * Lower rank values have higher priority.
 *
 * @param a - First property to compare
 * @param b - Second property to compare
 * @returns Sort comparison result
 */
export function sortPropertiesByTypeAndRank<T extends { property?: Property }>(
  a: T,
  b: T
): number {
  // Check if both properties exist
  if (!a.property || !b.property) return 0;

  // First sort by type: classifiers before specifiers
  const typeOrder = { classifier: 0, specifier: 1 };
  const typeA = typeOrder[a.property.type as keyof typeof typeOrder] ?? 2;
  const typeB = typeOrder[b.property.type as keyof typeof typeOrder] ?? 2;

  if (typeA !== typeB) {
    return typeA - typeB;
  }

  // Then sort by rank (lower rank comes first)
  const rankA = a.property.rank ?? Infinity;
  const rankB = b.property.rank ?? Infinity;

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // If ranks are equal, sort alphabetically by key
  return a.property.key.localeCompare(b.property.key);
}

/**
 * Sorts an array of properties by type and rank.
 *
 * @param properties - Array of properties to sort
 * @returns Sorted array of properties
 */
export function sortProperties<T extends { property?: Property }>(
  properties: T[]
): T[] {
  return [...properties].sort(sortPropertiesByTypeAndRank);
}

/**
 * Sorts an array of feature properties by the type and rank of their property.
 *
 * @param featureProperties - Array of feature properties to sort
 * @returns Sorted array of feature properties
 */
export function sortFeatureProperties(
  featureProperties: Omit<FeatureProperty, 'featureId'>[]
): Omit<FeatureProperty, 'featureId'>[] {
  const propertiesToSort = featureProperties
    .map((fp) => fp.property)
    .filter((p) => p !== undefined) as Property[];

  // Create a simple comparison function for Property arrays
  const compareProperties = (a: Property, b: Property): number => {
    // First sort by type: classifiers before specifiers
    const typeOrder = { classifier: 0, specifier: 1 };
    const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 2;
    const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 2;

    if (typeA !== typeB) {
      return typeA - typeB;
    }

    // Then sort by rank (lower rank comes first)
    const rankA = a.rank ?? Infinity;
    const rankB = b.rank ?? Infinity;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // If ranks are equal, sort alphabetically by key
    return a.key.localeCompare(b.key);
  };

  const sortedProperties = [...propertiesToSort].sort(compareProperties);

  // Map back to original feature properties in sorted order
  return sortedProperties
    .map((sortedProp) =>
      featureProperties.find((fp) => fp.property?.id === sortedProp?.id)
    )
    .filter((fp): fp is Omit<FeatureProperty, 'featureId'> => fp !== undefined);
}


export let getGroupedClassifierProperties = async (appCtx : AppCtx) : Promise<Array<{
  hierarchy: {
    organisation: string | null;
    project: string | null;
    layer: string | null;
    layerId: string;
  };
  properties: Property[];
}>> => {
  const results = await Promise.all(
    appCtx.getPrism(FirstClassResource.layer).map(async (layerId) => {
      // Get layer
      const layer = await appCtx.getLayerById(layerId);
      if (!layer) return null;
      // Get project and organisation for this layer
      const { project, organisation } = await appCtx.getHierarchy(layer);
      if (!project || !organisation) return null;

      // Get sorted classifier properties from layerProperties 
      const properties = await appCtx.getClassifierPropertiesForLayer(layer);
      if (properties.length === 0) return null;
      
      // Construct hierarchy info
      const hierarchy = {
        organisation: appCtx.getContextualOrganisationName(organisation),
        project: appCtx.getContextualProjectName(project),
        layer: appCtx.getContextualLayerName(layer),
        layerId: layer.id // Pass layerId for direct filter access
      };

      return {
        hierarchy,
        properties
      };
    })
  );

  // Filter out nulls and empty groups
  return results.filter(
    (group): group is NonNullable<typeof group> =>
      group !== null
  );
};
