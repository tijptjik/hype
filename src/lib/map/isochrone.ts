// TYPES
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson';

// TYPES
export interface IsochroneFeature extends GeoJSONFeature {
  properties: {
    fillOpacity?: number;
    fillColor?: string;
    opacity?: number;
    fill?: string;
    color?: string;
    contour?: number;
    metric?: string;
    area?: number;
  };
}

export interface IsochroneCollection extends FeatureCollection {
  features: IsochroneFeature[];
}

// CONSTANTS
const ISOCHRONE_BASE_URL = '/src/lib/map/data/isochrones/foodaccess/';
const ISOCHRONE_SOURCE_ID = 'isochrone-source';
const ISOCHRONE_LAYER_ID = 'isochrone-layer';

// STATE
let isochroneData: IsochroneCollection[] = [];
let isLoaded = false;

/**
 * Load all isochrone GeoJSON files from the data directory
 */
export const loadIsochroneData = async (): Promise<IsochroneCollection[]> => {
  if (isLoaded) {
    return isochroneData;
  }

  try {
    // List of all isochrone files
    const isochroneFiles = [
      'Chung Hom Kok_valhalla-isochrones_9_28_2025_17_11_55.geojson',
      'Ha Kwai Chung_valhalla-isochrones_9_28_2025_17_18_39.geojson',
      'Jardine_s Lookout_valhalla-isochrones_9_28_2025_17_1_29.geojson',
      'Lam Tin_valhalla-isochrones_9_28_2025_17_40_33.geojson',
      'Lohas Park_valhalla-isochrones_9_28_2025_17_6_9.geojson',
      'Mid levels_valhalla-isochrones_9_28_2025_16_52_21.geojson',
      'Ping Shek_valhalla-isochrones_9_28_2025_17_36_10.geojson',
      'Po Lam_valhalla-isochrones_9_28_2025_17_4_10.geojson',
      'San Po Kong_valhalla-isochrones_9_28_2025_17_16_52.geojson',
      'Sham Shui Po_valhalla-isochrones_9_28_2025_17_27_21.geojson',
      'Shek Tong Tsui_valhalla-isochrones_9_28_2025_16_19_20.geojson',
      'Tai Hang_valhalla-isochrones_9_28_2025_16_57_2.geojson',
      'Tsz Wan Shan_valhalla-isochrones_9_28_2025_17_15_45.geojson',
      'Wah Fu_valhalla-isochrones_9_28_2025_17_10_5.geojson',
      'Wah King_valhalla-isochrones_9_28_2025_17_24_53.geojson',
      'Yau Yat Tsuen_valhalla-isochrones_9_28_2025_17_32_59.geojson'
    ];

    // Load all isochrone files
    const loadPromises = isochroneFiles.map(async (filename) => {
      try {
        const response = await fetch(`/data/isochrones/foodaccess/${filename}`);
        if (!response.ok) {
          console.warn(`Failed to load isochrone file: ${filename}`);
          return null;
        }
        const data: IsochroneCollection = await response.json();
        return data;
      } catch (error) {
        console.warn(`Error loading isochrone file ${filename}:`, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    isochroneData = results.filter(
      (data): data is IsochroneCollection => data !== null
    );
    isLoaded = true;

    console.log('🔍 XXX Loaded isochrone data:', isochroneData.length, 'files');
    return isochroneData;
  } catch (error) {
    console.error('Error loading isochrone data:', error);
    return [];
  }
};

/**
 * Add isochrone data to the map as a source and layer
 */
export const addIsochroneToMap = async (map: MaplibreMap): Promise<void> => {
  try {
    // Load isochrone data if not already loaded
    const data = await loadIsochroneData();

    if (data.length === 0) {
      console.warn('No isochrone data to add to map');
      return;
    }

    // Combine all isochrone features into a single collection
    const combinedFeatures: IsochroneFeature[] = [];
    data.forEach((collection) => {
      combinedFeatures.push(...collection.features);
    });

    const combinedCollection: IsochroneCollection = {
      type: 'FeatureCollection',
      features: combinedFeatures
    };

    console.log('🔍 XXX Adding isochrone to map:', combinedFeatures.length, 'features');

    // Add source to map
    if (map.getSource(ISOCHRONE_SOURCE_ID)) {
      map.removeSource(ISOCHRONE_SOURCE_ID);
    }

    map.addSource(ISOCHRONE_SOURCE_ID, {
      type: 'geojson',
      data: combinedCollection
    });

    // Add layer to map
    if (map.getLayer(ISOCHRONE_LAYER_ID)) {
      map.removeLayer(ISOCHRONE_LAYER_ID);
    }

    // Add fill layer with fade-in animation
    map.addLayer({
      id: ISOCHRONE_LAYER_ID,
      type: 'fill',
      source: ISOCHRONE_SOURCE_ID,
      paint: {
        'fill-color': [
          'case',
          ['has', 'fillColor'],
          ['get', 'fillColor'],
          '#bf4040' // Default color
        ],
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          0, // Start with 0 opacity
          1,
          [
            'case',
            ['has', 'fillOpacity'],
            ['get', 'fillOpacity'],
            0.33 // Default opacity
          ]
        ]
      }
    });

    // Add stroke layer with fade-in animation
    map.addLayer({
      id: `${ISOCHRONE_LAYER_ID}-stroke`,
      type: 'line',
      source: ISOCHRONE_SOURCE_ID,
      paint: {
        'line-color': [
          'case',
          ['has', 'color'],
          ['get', 'color'],
          '#bf4040' // Default color
        ],
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          0, // Start with 0 opacity
          1,
          [
            'case',
            ['has', 'opacity'],
            ['get', 'opacity'],
            0.6 // Default opacity
          ]
        ],
        'line-width': 1
      }
    });

    // Animate the layers in
    setTimeout(() => {
      map.setPaintProperty(ISOCHRONE_LAYER_ID, 'fill-opacity', [
        'case',
        ['has', 'fillOpacity'],
        ['get', 'fillOpacity'],
        0.33
      ]);
      map.setPaintProperty(`${ISOCHRONE_LAYER_ID}-stroke`, 'line-opacity', [
        'case',
        ['has', 'opacity'],
        ['get', 'opacity'],
        0.6
      ]);
    }, 100);

    console.log('🔍 XXX Isochrone layers added to map successfully');
  } catch (error) {
    console.error('Error adding isochrone to map:', error);
  }
};

/**
 * Remove isochrone data from the map with fade-out animation
 */
export const removeIsochroneFromMap = (map: MaplibreMap): void => {
  try {
    // Fade out layers first
    if (map.getLayer(ISOCHRONE_LAYER_ID)) {
      map.setPaintProperty(ISOCHRONE_LAYER_ID, 'fill-opacity', 0);
    }
    if (map.getLayer(`${ISOCHRONE_LAYER_ID}-stroke`)) {
      map.setPaintProperty(`${ISOCHRONE_LAYER_ID}-stroke`, 'line-opacity', 0);
    }

    // Remove layers after fade animation
    setTimeout(() => {
      if (map.getLayer(ISOCHRONE_LAYER_ID)) {
        map.removeLayer(ISOCHRONE_LAYER_ID);
      }
      if (map.getLayer(`${ISOCHRONE_LAYER_ID}-stroke`)) {
        map.removeLayer(`${ISOCHRONE_LAYER_ID}-stroke`);
      }

      // Remove source
      if (map.getSource(ISOCHRONE_SOURCE_ID)) {
        map.removeSource(ISOCHRONE_SOURCE_ID);
      }
    }, 300); // Match fade duration

    console.log('🔍 XXX Isochrone removed from map');
  } catch (error) {
    console.error('Error removing isochrone from map:', error);
  }
};

/**
 * Toggle isochrone visibility on the map
 */
export const toggleIsochroneVisibility = (map: MaplibreMap, visible: boolean): void => {
  try {
    const visibility = visible ? 'visible' : 'none';

    if (map.getLayer(ISOCHRONE_LAYER_ID)) {
      map.setLayoutProperty(ISOCHRONE_LAYER_ID, 'visibility', visibility);
    }
    if (map.getLayer(`${ISOCHRONE_LAYER_ID}-stroke`)) {
      map.setLayoutProperty(`${ISOCHRONE_LAYER_ID}-stroke`, 'visibility', visibility);
    }

    console.log('🔍 XXX Isochrone visibility set to:', visibility);
  } catch (error) {
    console.error('Error toggling isochrone visibility:', error);
  }
};

/**
 * Check if isochrone is currently visible on the map
 */
export const isIsochroneVisible = (map: MaplibreMap): boolean => {
  try {
    const layer = map.getLayer(ISOCHRONE_LAYER_ID);
    if (!layer) return false;

    const visibility = map.getLayoutProperty(ISOCHRONE_LAYER_ID, 'visibility');
    return visibility === 'visible';
  } catch (error) {
    console.error('Error checking isochrone visibility:', error);
    return false;
  }
};

/**
 * Check if a point is inside any isochrone polygon
 */
export const isPointInIsochrone = (
  map: MaplibreMap,
  lng: number,
  lat: number
): boolean => {
  try {
    if (!map.getSource(ISOCHRONE_SOURCE_ID)) {
      return false;
    }

    // Query features at the point
    const features = map.queryRenderedFeatures(map.project([lng, lat]), {
      layers: [ISOCHRONE_LAYER_ID]
    });

    return features.length > 0;
  } catch (error) {
    console.error('Error checking point in isochrone:', error);
    return false;
  }
};

/**
 * Update marker styles based on whether they're inside or outside isochrone polygons
 */
export const updateMarkerStylesForIsochrone = (map: MaplibreMap, appCtx: any): void => {
  try {
    if (!map.getSource(ISOCHRONE_SOURCE_ID)) {
      // No isochrone data, reset all markers to default
      for (const [featureId, marker] of appCtx.state.markers.entries()) {
        const element = marker.getElement();
        element.classList.remove('marker-inside-isochrone', 'marker-outside-isochrone');
      }
      return;
    }

    // Update each marker based on isochrone intersection
    for (const [featureId, marker] of appCtx.state.markers.entries()) {
      const lngLat = marker.getLngLat();
      const isInside = isPointInIsochrone(map, lngLat.lng, lngLat.lat);

      const element = marker.getElement();
      element.classList.remove('marker-inside-isochrone', 'marker-outside-isochrone');

      if (isInside) {
        element.classList.add('marker-inside-isochrone');
      } else {
        element.classList.add('marker-outside-isochrone');
      }
    }

    console.log('🔍 XXX Updated marker styles for isochrone');
  } catch (error) {
    console.error('Error updating marker styles for isochrone:', error);
  }
};

/**
 * Set up marker style updates when isochrone data changes
 */
export const setupIsochroneMarkerUpdates = (map: MaplibreMap, appCtx: any): void => {
  // Update markers when isochrone data is added
  map.on('sourcedata', (e) => {
    if (e.sourceId === ISOCHRONE_SOURCE_ID && e.isSourceLoaded) {
      setTimeout(() => {
        updateMarkerStylesForIsochrone(map, appCtx);
      }, 100);
    }
  });

  // Update markers when map moves (in case markers move relative to isochrones)
  map.on('moveend', () => {
    if (isIsochroneVisible(map)) {
      updateMarkerStylesForIsochrone(map, appCtx);
    }
  });
};
