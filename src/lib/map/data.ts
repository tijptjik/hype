// I18N
import { m, getI18nValue, getLocale } from '$lib/i18n';
// DATA
import neighbourhoods from './neighbourhoods.json';
import subNeighbourhoods from './subNeighbourhoods.json';
// TYPES
import type { mapContext } from '$lib/context/map.svelte';
import type { SearchResult } from '$lib/types';

export function getWishlistedFeatures(mapContext: mapContext) {
  const wishlistedFeatures = mapContext.getWishlistedFeatures();
  return wishlistedFeatures.map((feature) => {
    const layer = mapContext.getLayer(feature);
    const project = layer ? mapContext.getProject(layer) : undefined;
    const organisation = project ? mapContext.getOrganisation(project) : undefined;

    const projectLayerCount = mapContext.state.resources.layer.filter(
      (l) => l.projectId === project?.id
    ).length;

    return {
      ...feature,
      hierarchy: {
        organisation: organisation ? getI18nValue(organisation, 'nameShort') : null,
        project: project ? getI18nValue(project, 'nameShort') : null,
        layer: layer
          ? projectLayerCount > 1
            ? getI18nValue(layer, 'nameShort')
            : null
          : null,
        feature: getI18nValue(feature, 'title')
      }
    };
  });
}

export function filterNeighbourhoods(term: string) {
  if (!term) return Object.entries(neighbourhoods);
  const searchLower = term.toLowerCase();
  return Object.entries(neighbourhoods).filter(([key, data]) =>
    getLocale() == 'en'
      ? key.toLowerCase().includes(searchLower) ||
        data.district.toLowerCase().includes(searchLower) ||
        data.region.toLowerCase().includes(searchLower)
      : getI18nValue(data, 'name').toLowerCase().includes(searchLower) ||
        getI18nValue(data, 'district').toLowerCase().includes(searchLower) ||
        getI18nValue(data, 'region').toLowerCase().includes(searchLower)
  );
}

export function getNeighbourhoodFeatureCount(
  neighbourhoodKey: string,
  features: any[]
) {
  let count = 0;
  if (neighbourhoodKey in subNeighbourhoods) {
    subNeighbourhoods[neighbourhoodKey as keyof typeof subNeighbourhoods].forEach(
      (n) => {
        count += features.filter(
          (feature) => n === feature.addressProperties?.neighbourhood
        ).length;
      }
    );
  } else {
    count = features.filter(
      (feature) => neighbourhoodKey === feature.addressProperties?.neighbourhood
    ).length;
  }
  return count;
}

export function searchAll(term: string, mapContext: mapContext): SearchResult[] {
  const results: SearchResult[] = [];

  // Source 1 - Walks
  const wishlistResults = getWishlistedFeatures(mapContext);
  const filteredWishlistResults = wishlistResults.filter((feature) =>
    feature?.hierarchy.feature?.toLowerCase().includes(term.toLowerCase())
  );
  if (filteredWishlistResults.length > 0) {
    results.push({
      name: m.omni__title_star_walks(),
      count: filteredWishlistResults.length,
      group: 'walks',
      ref: 'stars'
    });
  }

  // Source 2 - Neighbourhoods
  const neighbourhoodResults = filterNeighbourhoods(term);
  neighbourhoodResults.forEach(([neighbourhood, data]) => {
    results.push({
      name: getLocale() === 'en' ? neighbourhood : getI18nValue(data, 'name'),
      count: getNeighbourhoodFeatureCount(
        neighbourhood,
        mapContext.state.resources.feature
      ),
      group: 'neighbourhoods',
      ref: neighbourhood
    });
  });

  // Source 3 - Features
  mapContext.state.resources.feature
    .filter(
      (feature) =>
        getI18nValue(feature, 'title')?.toLowerCase().includes(term.toLowerCase()) ||
        getI18nValue(feature, 'description')
          ?.toLowerCase()
          .includes(term.toLowerCase()) ||
        getI18nValue(feature, 'displayAddress')
          ?.toLowerCase()
          .includes(term.toLowerCase())
    )
    .forEach((feature) => {
      results.push({
        name: getI18nValue(feature, 'title'),
        count: 1,
        group: 'features',
        ref: feature.id
      });
    });

  return results;
}

export function searchNearest(mapContext: mapContext): SearchResult[] {
  if (!mapContext.state.userLocation) return [];

  const userLocation = mapContext.state.userLocation
    ? {
        lat: mapContext.state.userLocation?.coords.latitude,
        lng: mapContext.state.userLocation?.coords.longitude
      }
    : mapContext.map?.getCenter();

  const results: SearchResult[] = [];

  // Source 1 - Walks
  // TODO Implement

  // Source 2 - Neighbourhoods

  // Calculate distance to each centroid of neighbourhoods
  const neighbourhoodResults = filterNeighbourhoods('');
  neighbourhoodResults.forEach(([neighbourhood, data]) => {
    results.push({
      name: getLocale() === 'en' ? neighbourhood : getI18nValue(data, 'name'),
      count: getNeighbourhoodFeatureCount(
        neighbourhood,
        mapContext.state.resources.feature
      ),
      group: 'neighbourhoods',
      ref: neighbourhood
    });
  });

  // Source 3 - Features

  // Calculate distance to each feature, and sort by distance
  mapContext.state.resources.feature
    .filter(
      (feature) =>
        getI18nValue(feature, 'title')?.toLowerCase().includes('') ||
        getI18nValue(feature, 'description')?.toLowerCase().includes('') ||
        getI18nValue(feature, 'displayAddress')?.toLowerCase().includes('')
    )
    .forEach((feature) => {
      results.push({
        name: getI18nValue(feature, 'title'),
        count: 1,
        group: 'features',
        ref: feature.id
      });
    });

  return results;
}
