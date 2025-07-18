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

export function buildNeighbourhoodSubdivisionMap(
  locale?: string
): Map<string, string[]> {
  if (!locale) {
    locale = getLocale();
  }

  const subNeighbourhoodsMap = new Map<string, string[]>();

  for (const [key, data] of Object.entries(neighbourhoods)) {
    const name = data.i18n[locale as keyof typeof data.i18n]?.name;
    const neighbourhood = data.i18n[locale as keyof typeof data.i18n]?.neighbourhood;

    // Handle neighbourhood as string or array
    const neighbourhoodKeys = Array.isArray(neighbourhood)
      ? neighbourhood
      : [neighbourhood];

    for (const hoodKey of neighbourhoodKeys) {
      if (!subNeighbourhoodsMap.has(hoodKey)) {
        subNeighbourhoodsMap.set(hoodKey, []);
      }
      subNeighbourhoodsMap.get(hoodKey)!.push(name);
    }
  }

  return subNeighbourhoodsMap;
}
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
