// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// DATA
import neighbourhoods from './neighbourhoods.json';
import subNeighbourhoods from './subNeighbourhoods.json';
// TYPES
import type { MapCtx } from '$lib/context/map.svelte';
import type {
  Feature,
  FeatureExtended,
  Layer,
  NeighbourhoodMap,
  SearchResult,
  UserFeature
} from '$lib/types';
import type { LngLatLike } from 'maplibre-gl';

// Helper function to convert i18n array to Record<Locale, T> format
function convertI18nArrayToRecord(i18nArray: any[]) {
  const record: Record<string, any> = {};
  i18nArray.forEach((item) => {
    record[item.locale] = item;
  });
  return record;
}

export function getWishlistedFeatures(mapCtx: MapCtx): FeatureExtended[] {
  const wishlistedFeatures = mapCtx.getWishlistedFeatures();
  return wishlistedFeatures.map((feature) => {
    const layer = mapCtx.getLayer(feature);
    const project = layer ? mapCtx.getProject(layer) : undefined;
    const organisation = project ? mapCtx.getOrganisation(project) : undefined;

    const projectLayerCount = mapCtx.state.resources.layer.filter(
      (l: Layer) => l.projectId === project?.id
    ).length;

    return {
      ...feature,
      hierarchy: {
        organisation: organisation ? getI18n(organisation, 'nameShort', mapCtx.getUserPreferences()) : null,
        project: project ? getI18n(project, 'nameShort', mapCtx.getUserPreferences()) : null,
        layer: layer
          ? projectLayerCount > 1
            ? getI18n(layer, 'nameShort', mapCtx.getUserPreferences())
            : null
          : null,
        feature: getI18n(feature, 'title', mapCtx.getUserPreferences())
      }
    };
  });
}

export function filterNeighbourhoods(mapCtx: MapCtx, term: string) {
  if (!term) return Object.entries(neighbourhoods);
  const searchLower = term.toLowerCase();
  return Object.entries(neighbourhoods).filter(([key, data]) => {
    return (
      getI18n(data, 'name', mapCtx.getUserPreferences()).toLowerCase().includes(searchLower) ||
      getI18n(data, 'district', mapCtx.getUserPreferences()).toLowerCase().includes(searchLower) ||
      getI18n(data, 'region', mapCtx.getUserPreferences()).toLowerCase().includes(searchLower)
    );
  });
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
          (feature: Feature) =>
            n === feature.i18n[getLocale()]?.addressProperties?.neighbourhood
        ).length;
      }
    );
  } else {
    count = features.filter(
      (feature: Feature) =>
        neighbourhoodKey === feature.i18n[getLocale()]?.addressProperties?.neighbourhood
    ).length;
  }
  return count;
}

export function searchAll(term: string, mapCtx: MapCtx): SearchResult[] {
  const results: SearchResult[] = [];

  // Source 1 - Walks
  const wishlistResults = getWishlistedFeatures(mapCtx);
  const filteredWishlistResults = wishlistResults.filter(
    (feature: FeatureExtended) =>
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
  const neighbourhoodResults = filterNeighbourhoods(mapCtx, term);
  neighbourhoodResults.forEach(([neighbourhood, data]) => {
    results.push({
      name: getLocale() === 'en' ? neighbourhood : getI18n(data, 'name', mapCtx.getUserPreferences()),
      count: getNeighbourhoodFeatureCount(
        neighbourhood,
        mapCtx.state.resources.feature
      ),
      group: 'neighbourhoods',
      ref: neighbourhood
    });
  });

  // Source 3 - Features
  mapCtx.state.resources.feature
    .filter(
      (feature: Feature) =>
        getI18n(feature, 'title', mapCtx.getUserPreferences())?.toLowerCase().includes(term.toLowerCase()) ||
        getI18n(feature, 'description', mapCtx.getUserPreferences())?.toLowerCase().includes(term.toLowerCase()) ||
        getI18n(feature, 'displayAddress', mapCtx.getUserPreferences())?.toLowerCase().includes(term.toLowerCase())
    )
    .forEach((feature) => {
      results.push({
        name: getI18n(feature, 'title', mapCtx.getUserPreferences()),
        count: 1,
        group: 'features',
        ref: feature.id
      });
    });

  return results;
}

export function searchNearest(mapCtx: MapCtx): SearchResult[] {
  if (!mapCtx.state.userLocation) return [];

  const userLocation = mapCtx.state.userLocation
    ? {
        lat: mapCtx.state.userLocation?.coords.latitude,
        lng: mapCtx.state.userLocation?.coords.longitude
      }
    : mapCtx.map?.getCenter();

  const results: SearchResult[] = [];

  // Source 1 - Walks
  // TODO Implement

  // Source 2 - Neighbourhoods

  // Calculate distance to each centroid of neighbourhoods
  const neighbourhoodResults = filterNeighbourhoods(mapCtx, '');
  neighbourhoodResults.forEach(([neighbourhood, data]) => {
    results.push({
      name: getI18n(data, 'name', mapCtx.getUserPreferences()),
      count: getNeighbourhoodFeatureCount(
        neighbourhood,
        mapCtx.state.resources.feature
      ),
      group: 'neighbourhoods',
      ref: neighbourhood
    });
  });

  // Source 3 - Features

  // Calculate distance to each centroid of neighbourhoods
  mapCtx.state.resources.feature
    .filter(
      (feature: Feature) =>
        getI18n(feature, 'title', mapCtx.getUserPreferences())?.toLowerCase().includes('') ||
        getI18n(feature, 'description', mapCtx.getUserPreferences())?.toLowerCase().includes('') ||
        getI18n(feature, 'displayAddress', mapCtx.getUserPreferences())?.toLowerCase().includes('')
    )
    .forEach((feature) => {
      results.push({
        name: getI18n(feature, 'title', mapCtx.getUserPreferences()),
        count: 1,
        group: 'features',
        ref: feature.id
      });
    });

  return results;
}


export function getCoordinates(lngLat: LngLatLike | null): [number, number] | null {
  if (!lngLat) return null;
  if (Array.isArray(lngLat)) {
    return lngLat;
  }
  if ('lon' in lngLat) {
    return [lngLat.lon, lngLat.lat];
  } else if ('lng' in lngLat) {
    return [lngLat.lng, lngLat.lat];
  }
  return null;
};