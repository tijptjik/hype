// TYPES
import type { AppCtx } from '$lib/context/app.svelte'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. STYLE RESOLUTION
//    - getActiveMapStyleCode(appCtx: AppCtx): string | null
//
// ═══════════════════════

/**
 * Resolves the currently active map-style code from the active resource context.
 *
 * @param appCtx - Shared application context containing active resource state.
 * @returns Project-backed map-style code for the active resource, or `null`.
 */
export const getActiveMapStyleCode = (appCtx: AppCtx): string | null => {
  const activeResourceType = appCtx.getActiveResourceType()
  const activeResourceId = appCtx.getActiveResourceId()
  const projects = appCtx.state.resources.project
  const layers = appCtx.state.resources.layer
  const features = appCtx.state.resources.feature

  if (activeResourceType === 'layer' && activeResourceId) {
    const activeLayer = layers.find(layer => layer.id === activeResourceId)
    if (activeLayer) {
      return (
        projects.find(project => project.id === activeLayer.projectId)?.mapStyle
          ?.code ?? null
      )
    }
  }

  if (activeResourceType === 'project' && activeResourceId) {
    return (
      projects.find(project => project.id === activeResourceId)?.mapStyle?.code ?? null
    )
  }

  if (activeResourceType === 'feature' && activeResourceId) {
    const activeFeature = features.find(feature => feature.id === activeResourceId)
    if (activeFeature) {
      return (
        projects.find(project => project.id === activeFeature.projectId)?.mapStyle
          ?.code ?? null
      )
    }
  }

  const firstPrismLayerId = appCtx.state.prisms.layer[0]
  if (firstPrismLayerId) {
    const firstPrismLayer = layers.find(layer => layer.id === firstPrismLayerId)
    if (firstPrismLayer) {
      return (
        projects.find(project => project.id === firstPrismLayer.projectId)?.mapStyle
          ?.code ?? null
      )
    }
  }

  return null
}
