// TOAST
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// ICONS
import RefreshCwIcon from 'virtual:icons/lucide/refresh-cw'
// TYPES
import type { HeaderTitleMenuItemConfig } from '$lib/bits/patterns/layout/header/header.types'
import type { AppCtx } from '$lib/context/app.svelte'

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
