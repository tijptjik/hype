import { getBreadcrumbs } from '$lib/navigation'
import type { AppCtx } from '$lib/context/app.svelte'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { HeaderProps } from './header.types'
import type { Component } from 'svelte'
import type { FilterState } from '$lib/types'
import type { HeaderCrumb } from '$lib/bits/custom/header'
import { FirstClassResource, Panel, ResourcePath } from '$lib/enums'
import { getHeaderCtrl } from '$lib/context/header.svelte'

/**
 * Adapter that wires Admin/App context state into the header pattern component API.
 * @param appCtx - Shared app context used for user, form, filter, and UI state.
 * @param adminCtx - Admin context used for resource navigation, facets, and admin actions.
 * @returns Header model exposing `getHeaderProps()` for `<Header />`.
 * @remarks
 * This keeps header UI components presentation-focused while centralizing mapping logic,
 * derived visibility rules, and action handlers in one place.
 */
export function useHeaderAdapter(
  appCtx: AppCtx,
  adminCtx: AdminCtx,
): { getHeaderProps: () => HeaderProps } {
  const headerCtrl = getHeaderCtrl()
  let query = $state('')
  let crumbs: HeaderCrumb[] = $state([])

  // Narrow unknown resource keys to filterable resource keys.
  function isFilterResource(value: unknown): value is keyof FilterState {
    return typeof value === 'string' && value in appCtx.state.filters
  }

  // Keep the header search query in sync with the active resource filter text.
  $effect(() => {
    const resourceType = appCtx.headerResourceType
    if (!resourceType || !isFilterResource(resourceType)) {
      query = ''
      return
    }
    query = appCtx.state.filters[resourceType].text || ''
  })

  // Resolve breadcrumbs for entity routes and clear them for index routes.
  $effect(() => {
    const resourceType = adminCtx.activeResourceType
    const resourceRef = adminCtx.activeResourceRef

    if (!resourceType || !resourceRef) {
      crumbs = []
      return
    }

    let cancelled = false

    void getBreadcrumbs(adminCtx.appCtx, resourceType, resourceRef)
      .then(nextCrumbs => {
        if (!cancelled) {
          crumbs = nextCrumbs
        }
      })
      .catch(() => {
        if (!cancelled) {
          crumbs = []
        }
      })

    return () => {
      cancelled = true
    }
  })

  const headerResourceType = $derived(appCtx.headerResourceType)
  const isIndex = $derived(adminCtx.activeResourceRef === false)
  const layoutModes = $derived.by(() => {
    if (!headerResourceType) return [] as ('card' | 'table' | 'list')[]
    if (headerResourceType === FirstClassResource.feature) return ['card', 'table']
    if (
      headerResourceType === FirstClassResource.organisation ||
      headerResourceType === FirstClassResource.project ||
      headerResourceType === FirstClassResource.layer
    ) {
      return ['card', 'list']
    }
    return []
  })
  const facetItems = $derived(headerCtrl.state.meta.facets)
  const layoutMode = $derived(
    headerResourceType ? appCtx.state.ui.layoutMode[headerResourceType] : 'card',
  )
  const controlMode = $derived(
    headerResourceType
      ? appCtx.state.ui.controlMode[headerResourceType] === 'filter'
      : false,
  )
  const showAvatar = $derived(!appCtx.state.panels.settings.isOpen)
  const currentUser = $derived(appCtx.user ?? null)
  const currentUserName = $derived(
    currentUser?.displayUsername ?? currentUser?.name ?? currentUser?.username ?? null,
  )
  const currentUserImage = $derived(currentUser?.image ?? null)
  const controlsMode = $derived(headerCtrl.state.controlsMode)
  const visibility = $derived(headerCtrl.state.visibility)
  const headerTitle = $derived(headerCtrl.state.meta.title)
  const headerIcon = $derived(headerCtrl.state.meta.icon)
  const headerHref = $derived.by(() => {
    if (!headerResourceType) return undefined
    if (!(headerResourceType in ResourcePath)) return undefined
    return `/admin/${ResourcePath[headerResourceType as FirstClassResource]}`
  })
  // Form action state is pending integration and intentionally static for now.
  const isTainted = $derived(false)
  const isDeleted = $derived(false)
  const isPublished = $derived(false)

  // Apply free-text filter changes to the currently active resource list.
  function handleFilter(nextQuery: string): void {
    query = nextQuery
    const resourceType = appCtx.headerResourceType
    if (!resourceType || !isFilterResource(resourceType)) return
    appCtx.state.filters[resourceType].text = nextQuery
  }

  // Cycle the current resource layout mode through its supported layout options.
  function handleLayoutToggle(_: 'card' | 'table' | 'list'): void {
    const resourceType = appCtx.headerResourceType
    if (!resourceType) return

    const supportedModes = layoutModes
    if (supportedModes.length <= 1) return

    const currentMode = appCtx.state.ui.layoutMode[resourceType] as
      | 'card'
      | 'table'
      | 'list'
    const currentIndex = Math.max(0, supportedModes.indexOf(currentMode))
    const nextMode = supportedModes[(currentIndex + 1) % supportedModes.length]
    appCtx.setLayoutMode(nextMode)
  }

  // Toggle filter controls visibility and clear filters when controls are disabled.
  function handleControlsToggle(_: boolean): void {
    const resourceType = appCtx.headerResourceType
    if (!resourceType || !isFilterResource(resourceType)) return

    const isActive = appCtx.state.ui.controlMode[resourceType] === 'filter'
    const next = !isActive

    appCtx.setControlMode(next ? 'filter' : null)
    if (!next) {
      adminCtx.resetViewFilters()
    }
  }

  // Update the active facet tab from header facet interactions.
  function handleFacetChange(ref: string): void {
    adminCtx.setFacet(ref as Parameters<typeof adminCtx.setFacet>[0])
  }

  // Placeholder create handler until new-entity flow parity is wired.
  function handleCreate(): void {
    // TODO: wire parity behavior with NewEntityButton (association modal + navigation)
  }

  // Form reset handling is pending form context migration.
  function handleReset(): void {
    console.log('not implemented')
  }

  // Form submit handling is pending form context migration.
  function handleSave(): void {
    console.log('not implemented')
  }

  // Placeholder delete toggle handler until form migration is complete.
  function handleDeleteToggle(): void {
    // TODO: wire delete toggle behavior when form context migration is complete
  }

  // Placeholder publish toggle handler until form migration is complete.
  function handlePublishToggle(): void {
    // TODO: wire publish toggle behavior when form context migration is complete
  }

  const defaultVisibility = $derived.by(() => {
    const showLayoutToggle = isIndex && layoutModes.length > 1
    const showControlsToggle = isIndex && isFilterResource(headerResourceType)
    const showViewActionsBase = isIndex && (showLayoutToggle || showControlsToggle)
    const showFormActionsBase = !isIndex
    const showViewActions =
      controlsMode === 'view'
        ? true
        : controlsMode === 'form' || controlsMode === 'none'
          ? false
          : showViewActionsBase
    const showFormActions =
      controlsMode === 'form'
        ? true
        : controlsMode === 'view' || controlsMode === 'none'
          ? false
          : showFormActionsBase

    return {
      showNew: isIndex,
      showFilter: isIndex,
      showFacets: !isIndex && facetItems.length > 0,
      showLayoutToggle,
      showControlsToggle,
      showViewActions,
      showFormActions,
      showAvatar,
    }
  })

  const resolvedVisibility = $derived.by(() => ({
    showNew: visibility.showNew ?? defaultVisibility.showNew,
    showFilter: visibility.showFilter ?? defaultVisibility.showFilter,
    showFacets: visibility.showFacets ?? defaultVisibility.showFacets,
    showViewActions: visibility.showViewActions ?? defaultVisibility.showViewActions,
    showFormActions: visibility.showFormActions ?? defaultVisibility.showFormActions,
    showAvatar: visibility.showAvatar ?? defaultVisibility.showAvatar,
    showLayoutToggle: visibility.showLayoutToggle ?? defaultVisibility.showLayoutToggle,
    showControlsToggle:
      visibility.showControlsToggle ?? defaultVisibility.showControlsToggle,
  }))

  const headerProps = $derived<HeaderProps>({
    query,
    title: {
      text: headerTitle,
      icon: (headerIcon ?? undefined) as Component | undefined,
      href: headerHref,
      crumbs,
    },
    newAction: {
      isCreatable: resolvedVisibility.showNew,
      onCreate: handleCreate,
    },
    filter: {
      isFilterable: resolvedVisibility.showFilter,
      placeholder: 'Filter resources',
      onFilter: handleFilter,
    },
    facets: {
      items: resolvedVisibility.showFacets ? facetItems : [],
      active: adminCtx.activeFacet,
      onFacetChange: handleFacetChange,
    },
    viewActions: {
      visible: resolvedVisibility.showViewActions,
      showLayoutToggle: resolvedVisibility.showLayoutToggle,
      showControlsToggle: resolvedVisibility.showControlsToggle,
      layoutModes,
      layoutMode: layoutMode as 'card' | 'table' | 'list',
      controlMode,
      onLayoutToggle: handleLayoutToggle,
      onControlsToggle: handleControlsToggle,
    },
    formActions: {
      visible: resolvedVisibility.showFormActions,
      isTainted,
      isDeleted,
      isPublished,
      onReset: handleReset,
      onSave: handleSave,
      onDeleteToggle: handleDeleteToggle,
      onPublishToggle: handlePublishToggle,
    },
    avatar: {
      visible: resolvedVisibility.showAvatar,
      name: currentUserName,
      src: currentUserImage,
      alt: currentUserName ?? 'Current user',
      transitionDirection: 'right',
      onClick: () => appCtx.togglePanel(Panel.settings),
    },
  })

  return {
    getHeaderProps: () => headerProps,
  }
}
