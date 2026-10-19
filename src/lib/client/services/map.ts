// TOAST
import { toast } from 'svelte-sonner'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import RefreshCwIcon from 'virtual:icons/proicons/arrow-sync'
// MAP
import { isMapStyleKey } from '#lib/map/styles/registry.js'
// TYPES
import type { HeaderTitleMenuItemConfig } from '#lib/bits/patterns/layout/header/header.types.js'
import type { AppCtx } from '#lib/context/app.svelte.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. STYLE RESOLUTION
//    - getActiveMapStyleCode(appCtx: AppCtx): string | null
//
// 2. MAP PREVIEW ACTIONS
//    - createMapRenderTitleMenuItem(...)
//    - refreshMapRender(...)
//
// ═══════════════════════

/**
 * Resolves the currently active map-style code from the active resource context.
 *
 * @param appCtx - Shared application context containing active resource state.
 * @returns Layer/project style, or `null` when the resource follows User Preference.
 */
export const getActiveMapStyleCode = (appCtx: AppCtx): string | null => {
  const activeResourceType = appCtx.navigation.getActiveResourceType()
  const activeResourceId = appCtx.navigation.getActiveResourceId()
  // Pinned resources may be outside the current list page but remain in the cache.
  const projects = appCtx.view.cache.project
  const layers = appCtx.view.cache.layer
  const features = appCtx.view.cache.feature

  /**
   * Resolves a layer override before legacy project inheritance.
   * @param layer - Active layer with optional map-style metadata.
   * @returns Explicit/inherited style, or null for User Preference.
   */
  const layerStyle = (layer: {
    projectId: string
    metadata?: unknown
    mapStyleCode?: unknown
  }): string | null => {
    const metadata = layer.metadata as { mapStyleCode?: unknown } | null
    const code =
      layer.mapStyleCode !== undefined ? layer.mapStyleCode : metadata?.mapStyleCode
    if (code === null) return null
    if (typeof code === 'string' && isMapStyleKey(code)) return code
    return projects.get(layer.projectId)?.mapStyle?.code ?? null
  }

  // Selected layers override project prisms; older layers retain project inheritance.
  const firstPrismLayerId = appCtx.view.scope.prisms.layer[0]
  if (firstPrismLayerId) {
    const selectedLayer = layers.get(firstPrismLayerId)
    if (selectedLayer) return layerStyle(selectedLayer)
  }

  const firstPrismProjectId = appCtx.view.scope.prisms.project[0]
  if (firstPrismProjectId)
    return projects.get(firstPrismProjectId)?.mapStyle?.code ?? null

  if (activeResourceType === 'layer' && activeResourceId) {
    const activeLayer = layers.get(activeResourceId)
    if (activeLayer) return layerStyle(activeLayer)
  }

  if (activeResourceType === 'project' && activeResourceId) {
    return projects.get(activeResourceId)?.mapStyle?.code ?? null
  }

  if (activeResourceType === 'feature' && activeResourceId) {
    const activeFeature = features.get(activeResourceId)
    if (activeFeature) {
      const activeLayer = activeFeature.layerId
        ? layers.get(activeFeature.layerId)
        : undefined
      return activeLayer
        ? layerStyle(activeLayer)
        : (projects.get(activeFeature.projectId)?.mapStyle?.code ?? null)
    }
  }

  return null
}

type MapRenderKind = 'projects' | 'layers'

/**
 * Resolves the localized singular resource label used by map-render feedback.
 *
 * @param kind - Preview resource collection kind.
 * @returns Localized singular label for the preview target resource.
 */
function getMapRenderKindLabel(kind: MapRenderKind): string {
  return kind === 'projects'
    ? m.admin__map_preview_kind_project()
    : m.admin__map_preview_kind_layer()
}

/**
 * Builds the shared title-menu item used to trigger map preview regeneration.
 *
 * @param params - Preview action state and callback.
 * @returns Header dropdown item for the map preview action.
 */
export function createMapRenderTitleMenuItem(params: {
  isRefreshing: boolean
  onSelect: () => void
}): HeaderTitleMenuItemConfig {
  return {
    label: params.isRefreshing
      ? m.admin__map_preview_rendering()
      : m.admin__map_preview_title(),
    onSelect: params.onSelect,
    icon: RefreshCwIcon,
    iconClass:
      'bits-pattern-header__title-menu-item-icon bits-pattern-header__title-menu-item-icon--info',
    disabled: params.isRefreshing,
  }
}

/**
 * Regenerates one project or layer preview and mirrors request state into the header menu.
 *
 * @param params - Preview target and the setter used to mirror in-flight state.
 * @returns Promise that resolves after the preview request settles.
 */
export async function refreshMapRender(params: {
  kind: MapRenderKind
  id: string | null | undefined
  isRefreshing: boolean
  setRefreshing: (next: boolean) => void
}): Promise<void> {
  const identifier = params.id?.trim()
  const kindLabel = getMapRenderKindLabel(params.kind)

  if (!identifier || params.isRefreshing) {
    return
  }

  params.setRefreshing(true)

  try {
    const response = await fetch(
      `/api/mapRenders/${params.kind}/${identifier}/refresh`,
      {
        method: 'POST',
      },
    )

    if (!response.ok) {
      throw new Error(
        m.admin__map_preview_refresh_failed({
          resource: kindLabel,
          status: String(response.status),
        }),
      )
    }

    const result = (await response.json()) as {
      mode: 'enqueue' | 'local-generate'
      assetUrl: string
    }

    if (result.mode === 'local-generate') {
      toast.success(m.admin__map_preview_regenerated())
      return
    }

    toast.success(m.admin__map_preview_queued())
  } catch (error) {
    console.error(
      m.admin__map_preview_refresh_failed_log({ resource: kindLabel }),
      error,
    )
    toast.error(m.long_crazy_peacock_care())
  } finally {
    params.setRefreshing(false)
  }
}
