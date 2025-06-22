// I18N
import { getLocale } from '$lib/i18n';
// DATA
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
// TYPES
import type { AppCtx } from '$lib/context/app.svelte';
import type { Feature, Id } from '$lib/types';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. GETTERS
//    - getFeatureIdsForNeighbourhoods
//    - expandToSubNeighbourhoods
//
// 2. ANIMATION
//    - startCircularFlight

// ═══════════════════════
// 1. GETTERS
// ═══════════════════════

/**
 * Gets feature IDs filtered by selected neighbourhoods.
 * Returns all features if no neighbourhoods are selected.
 */
export function getFeatureIdsForNeighbourhoods(appCtx: AppCtx): Id[] {
  if (appCtx.state.filters.neighbourhoods.length === 0) {
    return Array.from(appCtx.features.keys());
  }
  const neighbourhoodFeatures = appCtx.state.filters.neighbourhoods.flatMap(
    (neighbourhood) => {
      return expandToSubNeighbourhoods(appCtx, neighbourhood);
    }
  );
  return neighbourhoodFeatures.map((f) => f.id);
}

/**
 * Expands a neighbourhood key to include all sub-neighbourhoods and their features.
 */
export function expandToSubNeighbourhoods(
  appCtx: AppCtx,
  neighbourhoodKey: string
): Feature[] {
  let neighbourhoodFeatures = [];
  if (neighbourhoodKey in subNeighbourhoods) {
    subNeighbourhoods[neighbourhoodKey as keyof typeof subNeighbourhoods].forEach(
      (n) => {
        neighbourhoodFeatures.push(
          ...appCtx.state.resources.feature.filter(
            (feature) =>
              n === feature.i18n?.[getLocale()]?.addressProperties?.neighbourhood
          )
        );
      }
    );
  } else {
    neighbourhoodFeatures.push(
      ...appCtx.state.resources.feature.filter(
        (feature) =>
          neighbourhoodKey ===
          feature.i18n?.[getLocale()]?.addressProperties?.neighbourhood
      )
    );
  }
  return neighbourhoodFeatures;
}

// ═══════════════════════
// 2. ANIMATION
// ═══════════════════════

/**
 * Starts a circular flight animation around a center point.
 * Completes a 5km circle in exactly 1 minute and loops continuously.
 */
export function startCircularFlight(
  appCtx: AppCtx,
  center: [number, number],
  radiusKm: number = 5
): (() => void) | void {
  if (!appCtx.map) return;

  const TOTAL_DURATION = 120000; // 1 minute in milliseconds
  let startTime: number | null = null;
  let animationId: number;

  const animate = (currentTime: number) => {
    if (!startTime) startTime = currentTime;

    // Calculate elapsed time and progress (0 to 1)
    const elapsed = (currentTime - startTime) % TOTAL_DURATION;
    const progress = elapsed / TOTAL_DURATION;

    // Calculate angle based on progress (0 to 2π radians)
    const angleRad = progress * 2 * Math.PI;

    // Calculate new position using proper geographic calculations
    const newLng = center[0] + (radiusKm / 111.32) * Math.cos(angleRad);
    const newLat =
      center[1] +
      (radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180))) *
        Math.sin(angleRad);

    // Calculate bearing as direction of travel (tangent to circle)
    // Add π/2 to get tangent direction, then convert to degrees
    const bearingRad = angleRad + Math.PI / 2;
    const bearingDeg = (bearingRad * 180) / Math.PI;

    // Use jumpTo for immediate, smooth positioning without animation conflicts
    appCtx.map?.jumpTo({
      center: [newLng, newLat],
      zoom: 14,
      bearing: bearingDeg,
      pitch: 45
    });

    // Continue animation
    animationId = requestAnimationFrame(animate);
  };

  // Start animation
  animationId = requestAnimationFrame(animate);

  // Return cleanup function (optional, for stopping the animation)
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  };
}
