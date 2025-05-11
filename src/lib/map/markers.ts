import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Feature } from '$lib/types';
import { MapContext } from '$lib/context/map.svelte';
// STYLES
import '$lib/styles/map.css';

// Track markers with their IDs
const currentMarkers: Map<string, Marker> = new Map();

// Function to create SVG marker element with fade-in animation
export function createMarkerElement(): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'marker-container marker-fade-in';
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

export function updateMarkers(mapCtx: MapContext, features: Feature[], maplibre: any) {
  if (!mapCtx.map) return;

  // Create a set of new feature IDs
  const newFeatureIds = new Set(features.map((f) => f.id as string));

  // Remove markers that are no longer present
  for (const [id, marker] of mapCtx.state.markers.entries()) {
    if (!newFeatureIds.has(id)) {
      marker.getElement().classList.add('marker-fade-out');
      // Remove marker after animation completes
      setTimeout(() => {
        marker.remove();
        mapCtx.state.markers.delete(id);
      }, 300); // Match this with CSS transition duration
    }
  }

  // Add or update markers
  features.forEach((feature) => {
    if (feature.geometry?.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;

      // Skip if marker already exists
      if (mapCtx.state.markers.has(feature.id)) return;

      // Create new marker
      const el = createMarkerElement();

      // Add data attributes to all elements in the marker
      const addDataToElements = (element: Element) => {
        element.setAttribute('data-type', 'marker');
        element.setAttribute('data-feature-id', feature.id as string);
        Array.from(element.children).forEach(addDataToElements);
      };
      addDataToElements(el);

      const marker = new maplibre.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([lng, lat])
        .addTo(mapCtx.map);

      // Add marker to mapCtx
      mapCtx.state.markers.set(feature.id, marker);
    }
  });

  // Return cleanup function
  return () => {
    // Remove all markers and their event listeners
    for (const [_, marker] of mapCtx.state.markers.entries()) {
      marker.remove(); // This also removes the event listeners
    }
    mapCtx.state.markers.clear();
  };
}

export function addMarkerClass(
  mapCtx: MapContext,
  featureId: string,
  className: string = 'active'
) {
  if (!mapCtx.map) return;
  // Set active state to new feature
  mapCtx.state.markers.get(featureId)?.getElement().classList.add(className);
}

export function removeMarkerClass(
  mapCtx: MapContext,
  featureId: string,
  className: string = 'active'
) {
  if (!mapCtx.map) return;
  mapCtx.state.markers.get(featureId)?.getElement().classList.remove(className);
}

export function addAddressMarker(
  maplibre: any,
  mapCtx: MapContext,
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
    .addTo(mapCtx.map);
  return marker;
}
