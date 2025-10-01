import type { FeatureFromCollection } from '$lib/types';
import { AppCtx } from '$lib/context/app.svelte';
// STYLES
import '$lib/styles/map.css';

// Function to create SVG marker element with fade-in animation
export function createMarkerElement(colorIndex?: number): HTMLDivElement {
  const container = document.createElement('div');
  container.className = `marker-container marker-fade-in${colorIndex !== undefined ? ` marker-layer-${colorIndex}` : ''}`;
  container.dataset.type = 'marker';

  const innerContainer = document.createElement('div');
  innerContainer.className = 'marker-inner';
  innerContainer.dataset.type = 'marker';

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.dataset.type = 'marker';

  // Create outer circle
  const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  outerCircle.setAttribute('cx', '12');
  outerCircle.setAttribute('cy', '12');
  outerCircle.setAttribute('r', '8');
  outerCircle.setAttribute('class', 'marker-circle');
  outerCircle.dataset.type = 'marker';

  // Create inner dot
  const innerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  innerDot.setAttribute('cx', '12');
  innerDot.setAttribute('cy', '12');
  innerDot.setAttribute('r', '2');
  innerDot.setAttribute('class', 'marker-dot');
  innerDot.dataset.type = 'marker';

  // Append circles to SVG
  svg.appendChild(outerCircle);
  svg.appendChild(innerDot);

  // Append SVG to inner container, then inner to outer
  innerContainer.appendChild(svg);
  container.appendChild(innerContainer);

  return container;
}

export function updateMarkers(
  appCtx: AppCtx,
  features: FeatureFromCollection[],
  maplibre: any
) {
  if (!appCtx.map) return;
  // Create a set of new feature IDs
  const newFeatureIds = new Set(features.map((f) => f.id as string));
  // Remove markers that are no longer present
  for (const [id, marker] of appCtx.state.markers.entries()) {
    if (!newFeatureIds.has(id)) {
      marker.getElement().classList.add('marker-fade-out');
      // Remove marker after animation completes
      setTimeout(() => {
        marker.remove();
        appCtx.state.markers.delete(id);
      }, 300); // Match this with CSS transition duration
    }
  }

  // Add or update markers
  features.forEach((feature) => {
    if (feature.geometry?.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      // Get layer color index for this feature
      const colorIndex = appCtx.state.layerColors.get(feature.layerId);

      // Check if marker DOM element already exists on the map
      const mapContainer = appCtx.map.getContainer();
      const existingMarkerElement = mapContainer.querySelector(
        `[data-feature-id="${feature.id}"]`
      );

      if (existingMarkerElement) {
        // Update existing marker's color class
        // Remove all existing layer color classes
        for (let i = 0; i < 10; i++) {
          existingMarkerElement.classList.remove(`marker-layer-${i}`);
        }
        // Add new color class if we have a color index
        if (colorIndex !== undefined) {
          existingMarkerElement.classList.add(`marker-layer-${colorIndex}`);
        }
        return;
      }

      // If marker exists in state but not in DOM, remove it from state
      const existingMarker = appCtx.state.markers.get(feature.id);
      if (existingMarker) {
        appCtx.state.markers.delete(feature.id);
      }

      // Create new marker with layer color class
      const el = createMarkerElement(colorIndex);
      // Add data attributes to all elements in the marker
      const addDataToElements = (element: Element) => {
        element.setAttribute('data-type', 'marker');
        element.setAttribute('data-feature-id', feature.id as string);
        if (feature.layerId) {
          element.setAttribute('data-layer-id', feature.layerId as string);
        }
        Array.from(element.children).forEach(addDataToElements);
      };
      addDataToElements(el);
      const marker = new maplibre.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([lng, lat])
        .addTo(appCtx.map);
      // Add marker to appCtx
      appCtx.state.markers.set(feature.id, marker);
    }
  });
  // Return cleanup function
  return () => {
    // Remove all markers and their event listeners
    for (const [_, marker] of appCtx.state.markers.entries()) {
      marker.remove(); // This also removes the event listeners
    }
    appCtx.state.markers.clear();
  };
}

export function addMarkerClass(
  appCtx: AppCtx,
  featureId: string,
  className: string = 'active'
) {
  if (!appCtx.map) return;
  // Set active state to new feature
  appCtx.state.markers.get(featureId)?.getElement().classList.add(className);
}

export function removeMarkerClass(
  appCtx: AppCtx,
  featureId: string,
  className: string = 'active'
) {
  if (!appCtx.map) return;
  appCtx.state.markers.get(featureId)?.getElement().classList.remove(className);
}

export function addAddressMarker(
  maplibre: any,
  appCtx: AppCtx,
  lngLat: [number, number]
) {
  const el = createMarkerElement();
  el.classList.add('marker-address');
  el.setAttribute('data-feature-property', 'geoCodeCoordinates');
  // @ts-ignore
  const marker = new maplibre.Marker({
    element: el,
    color: '#ef4444',
    anchor: 'center'
  })
    .setLngLat(lngLat)
    .addTo(appCtx.map);
  return marker;
}
