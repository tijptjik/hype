// SVELTEKIT
import { goto } from '$app/navigation'
import { page } from '$app/state'
// CONSTANTS
import { NEW_REF } from '#lib/constants.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// LIB
import { navigateOnAdmin } from '#lib/navigation/index.js'
import { authorizeHubList, toHubAuthActor } from '#lib/api/services/authz/hubPolicy.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import Eye from 'virtual:icons/proicons/eye'
import EyeOff from 'virtual:icons/proicons/eye-off'
import Funnel from 'virtual:icons/proicons/filter'
import FunnelX from 'virtual:icons/proicons/filter-cancel'
import LayoutGrid from 'virtual:icons/proicons/grid'
import List from 'virtual:icons/proicons/bullet-list'
import LoaderCircle from 'virtual:icons/proicons/spinner'
import Pencil from 'virtual:icons/proicons/pencil'
import FeatureIcon from 'virtual:icons/proicons/location'
import RotateCcw from 'virtual:icons/proicons/arrow-counterclockwise'
import Save from 'virtual:icons/proicons/save'
import Upload from 'virtual:icons/proicons/arrow-upload'
import Table2 from 'virtual:icons/proicons/table'
import Trash2 from 'virtual:icons/proicons/delete'
import HistoryIcon from 'virtual:icons/proicons/history'
import Undo2 from 'virtual:icons/proicons/arrow-undo'
import X from 'virtual:icons/proicons/cancel'
// ENUMS
import { FirstClassResource, Panel, ResourcePath } from '#lib/enums.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { FacetType } from '#lib/context/facets.js'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type {
  HeaderActionConfig,
  HeaderButtonActionConfig,
  HeaderCrumb,
  HeaderLayoutMode,
  HeaderProps,
} from '#lib/bits/patterns/layout/header/index.js'

import type { Component } from 'svelte'
import type { FilterState } from '#lib/client/services/filters.types.js'
import type { HeaderTitleMenuItemConfig } from '#lib/bits/patterns/layout/header/header.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. CONTEXT AND HELPERS
// - isFilterResource
// - getCachedEntityLabel
// - getCachedHeaderTitle
// - getCachedHeaderCrumbs
// - toLayoutActionMeta
//
// 1. DERIVED HEADER STATE
//
// 2. EFFECTS
//
// 3. VIEW ACTION HANDLERS
// - handleCreate
// - handleFilterChange
// - handleAdvanceFromSearch
// - handleAdvanceLayout
// - handleControlsToggle
// - handleFacetChange
//
// 4. FORM ACTION HANDLERS
// - handleReset
// - handleEditingToggle
// - handleSave
// - handleDeleteToggle
// - handlePublishToggle
//
// 5. VISIBILITY RESOLUTION
//
// 6. ACTION MODELS
//
// 7. PUBLIC CONTRACT
// ---

/**
 * Adapter that wires Admin/App context state into the header pattern component API.
 * @param appCtx - Shared app context used for user, form, filter, and UI state.
 * @param adminCtx - Admin context used for resource navigation, facets, and admin actions.
 * @returns Header model exposing `getHeaderProps()` for `<Header />`.
 * @remarks
 * This keeps header UI components presentation-focused while centralizing mapping logic,
 * derived visibility rules, and action handlers in one place.
 */
export function useAdminHeaderModel(
  appCtx: ResourceViewCtx,
  adminCtx: AdminCtx,
): { getHeaderProps: () => HeaderProps } {
  // ---
  /********************
   *  0. CONTEXT AND HELPERS
   ************/
  // +++ Context And Helpers
  const headerCtrl = getHeaderCtrl()

  // Narrow unknown resource keys to the subset that supports filter state.
  function isFilterResource(value: unknown): value is keyof FilterState {
    return typeof value === 'string' && value in appCtx.filters.values
  }

  // Resolve the best cached display label for a resource across localized names and refs.
  function getCachedEntityLabel(
    resourceType: FirstClassResource,
    resource: unknown,
  ): string {
    const localeKey = getLocaleKey()
    const i18n = (resource as { i18n?: Record<string, Record<string, string | null>> })
      ?.i18n
    const localized = i18n?.[localeKey]
    const english = i18n?.en

    switch (resourceType) {
      case FirstClassResource.organisation:
      case FirstClassResource.project:
      case FirstClassResource.layer:
      case FirstClassResource.hub:
        return (
          localized?.name?.trim() ||
          localized?.nameShort?.trim() ||
          english?.name?.trim() ||
          english?.nameShort?.trim() ||
          ((resource as { code?: string }).code ?? '').trim() ||
          ((resource as { id?: string }).id ?? '').trim()
        )

      case FirstClassResource.feature:
        return (
          localized?.title?.trim() ||
          english?.title?.trim() ||
          ((resource as { id?: string }).id ?? '').trim()
        )

      case FirstClassResource.task:
        return `#${((resource as { id?: string }).id ?? '').trim()}`
      default:
        return ((resource as { id?: string }).id ?? '').trim()
    }
  }

  // Resolve the compact cached label used in breadcrumb trails.
  function getCachedCrumbLabel(
    resourceType: FirstClassResource,
    resource: unknown,
    inOrganisationContext: boolean = false,
  ): string {
    switch (resourceType) {
      case FirstClassResource.organisation:
        return (
          appCtx.getContextualOrganisationName(resource as never, false, false) ||
          getCachedEntityLabel(resourceType, resource)
        )

      case FirstClassResource.project:
        return (
          appCtx.getContextualProjectName(
            resource as never,
            false,
            false,
            inOrganisationContext,
          ) || getCachedEntityLabel(resourceType, resource)
        )

      case FirstClassResource.layer:
        return (
          appCtx.getContextualLayerName(resource as never, false, false) ||
          getCachedEntityLabel(resourceType, resource)
        )

      case FirstClassResource.hub: {
        const localeKey = getLocaleKey()
        const i18n = (
          resource as { i18n?: Record<string, Record<string, string | null>> }
        )?.i18n
        const localized = i18n?.[localeKey]
        const english = i18n?.en

        return (
          localized?.nameShort?.trim() ||
          english?.nameShort?.trim() ||
          getCachedEntityLabel(resourceType, resource)
        )
      }
      case FirstClassResource.feature:
        return getCachedEntityLabel(resourceType, resource)
      case FirstClassResource.task:
        return `#${((resource as { id?: string }).id ?? '').trim()}`
      default:
        return ((resource as { id?: string }).id ?? '').trim()
    }
  }

  // Resolve the current header title synchronously from cache when explicit page title is absent.
  function getCachedHeaderTitle(): string {
    const resourceType = adminCtx.activeResourceType
    const resourceRef = adminCtx.activeResourceRef

    if (!resourceType || resourceRef === false) return ''

    const resource = appCtx.getResourceByRefSync(resourceType, resourceRef)

    if (!resource) {
      return resourceType === FirstClassResource.task
        ? `#${resourceRef}`
        : String(resourceRef)
    }

    return getCachedEntityLabel(resourceType, resource) || String(resourceRef)
  }

  // Build the current header breadcrumb trail synchronously from cached admin resources.
  function getCachedHeaderCrumbs(): HeaderCrumb[] {
    const resourceType = adminCtx.activeResourceType
    const resourceRef = adminCtx.activeResourceRef

    if (!resourceType || resourceRef === false) return []

    const resource = appCtx.getResourceByRefSync(resourceType, resourceRef)

    if (!resource) return []

    const toHref = (
      type: FirstClassResource,
      ref: string | undefined,
    ): string | undefined => (ref ? `/admin/${ResourcePath[type]}/${ref}` : undefined)

    const hubFromOrganisation = (organisation: unknown) => {
      const hubId = (organisation as { hubId?: string | null })?.hubId
      return hubId
        ? appCtx.getResourceByIdSync(FirstClassResource.hub, hubId)
        : undefined
    }

    const pushCrumb = (
      list: HeaderCrumb[],
      type: FirstClassResource,
      resourceValue: unknown,
    ): void => {
      if (!resourceValue) return
      const ref =
        type === FirstClassResource.layer
          ? ((resourceValue as { id?: string }).id ?? '').trim()
          : ((resourceValue as { code?: string }).code ?? '').trim()

      const name = getCachedCrumbLabel(
        type,
        resourceValue,
        list.some(crumb =>
          crumb.href?.startsWith(
            `/admin/${ResourcePath[FirstClassResource.organisation]}/`,
          ),
        ),
      )

      if (!name) return

      list.push({ name, href: toHref(type, ref) })
    }

    const crumbs: HeaderCrumb[] = []

    if (resourceType === FirstClassResource.hub) {
      pushCrumb(crumbs, FirstClassResource.hub, resource)
      return crumbs
    }

    if (
      resourceType === FirstClassResource.organisation ||
      resourceType === FirstClassResource.project ||
      resourceType === FirstClassResource.layer ||
      resourceType === FirstClassResource.feature
    ) {
      const hierarchy = appCtx.getHierarchySync(resource as never)
      const organisation = hierarchy.organisation
      const hub = organisation ? hubFromOrganisation(organisation) : undefined

      pushCrumb(crumbs, FirstClassResource.hub, hub)
      if (resourceType !== FirstClassResource.organisation) {
        pushCrumb(crumbs, FirstClassResource.organisation, organisation)
      }
      if (
        resourceType === FirstClassResource.layer ||
        resourceType === FirstClassResource.feature
      ) {
        pushCrumb(crumbs, FirstClassResource.project, hierarchy.project)
      }
      if (resourceType === FirstClassResource.feature) {
        pushCrumb(crumbs, FirstClassResource.layer, hierarchy.layer)
      }

      return crumbs
    }

    if (resourceType === FirstClassResource.task) {
      const taskResource = resource as {
        organisation?: unknown
        project?: unknown
        layer?: unknown
        feature?: unknown
      }

      const organisation = taskResource.organisation
      const project = taskResource.project
      const layer = taskResource.layer
      const feature = taskResource.feature
      const hierarchy = feature ? appCtx.getHierarchySync(feature as never) : null

      pushCrumb(crumbs, FirstClassResource.organisation, organisation)
      pushCrumb(crumbs, FirstClassResource.project, project)
      pushCrumb(crumbs, FirstClassResource.layer, layer ?? hierarchy?.layer)
      pushCrumb(crumbs, FirstClassResource.feature, feature)

      return crumbs
    }

    return []
  }

  function toLayoutActionMeta(
    mode: HeaderLayoutMode | null,
  ): { text: string; icon: Component } | null {
    if (mode === 'card') {
      return { text: m.admin__header_layout_card(), icon: LayoutGrid }
    }
    if (mode === 'table') {
      return { text: m.admin__header_layout_table(), icon: Table2 }
    }
    if (mode === 'list') {
      return { text: m.admin__header_layout_list(), icon: List }
    }
    return null
  }

  function getHeaderIconHoverColor(
    resourceType: FirstClassResource | false,
  ): string | undefined {
    switch (resourceType) {
      case FirstClassResource.hub:
        return 'var(--color-warning)'
      case FirstClassResource.organisation:
        return 'var(--color-primary)'
      case FirstClassResource.project:
        return 'var(--color-accent)'
      case FirstClassResource.layer:
        return 'var(--color-secondary)'
      case FirstClassResource.feature:
        return 'var(--color-primary)'
      case FirstClassResource.task:
        return 'var(--color-pending)'
      default:
        return undefined
    }
  }
  // ---

  /********************
   *  1. DERIVED HEADER STATE
   ************/
  // +++ Derived Header State

  // Mirror the active resource filter text into the header search input value.
  const query = $derived.by(() => {
    const resourceType = adminCtx.activeResourceType
    if (!resourceType || !isFilterResource(resourceType)) {
      return ''
    }
    return appCtx.filters.values[resourceType].text || ''
  })

  // DERIVED :: RESOURCE / ROUTE
  const headerResourceType = $derived(adminCtx.activeResourceType)
  const isIndex = $derived(adminCtx.activeResourceRef === false)
  const isEmbeddedIndex = $derived(headerCtrl.state.search?.indexView === true)
  const presentationResourceType = $derived(
    isEmbeddedIndex
      ? (headerCtrl.state.search?.resourceType ?? FirstClassResource.user)
      : headerResourceType,
  )
  const presentationListUi = $derived(
    headerCtrl.state.search?.listUi ?? adminCtx.listUi,
  )
  const layoutModes = $derived.by((): HeaderLayoutMode[] => {
    if (isEmbeddedIndex)
      return presentationResourceType === FirstClassResource.feature
        ? ['card', 'table']
        : ['list', 'card']
    if (!headerResourceType) return []
    if (headerResourceType === FirstClassResource.feature) return ['card', 'table']
    if (
      headerResourceType === FirstClassResource.hub ||
      headerResourceType === FirstClassResource.organisation ||
      headerResourceType === FirstClassResource.project ||
      headerResourceType === FirstClassResource.layer
    ) {
      return ['card', 'list']
    }
    return []
  })

  // DERIVED :: HEADER CTRL / VIEW STATE
  const facetItems = $derived(headerCtrl.state.meta.facets)
  const customActiveFacet = $derived(headerCtrl.state.meta.activeFacet)
  const customFacetChangeHandler = $derived(headerCtrl.state.meta.onFacetChange)
  const customViewActions = $derived(headerCtrl.state.meta.viewActions)
  const customTaskActions = $derived(headerCtrl.state.meta.taskActions)
  const customTaskActionContent = $derived(headerCtrl.state.meta.taskActionContent)
  const customCrumbs = $derived(headerCtrl.state.meta.crumbs)
  const titleMenuMetaItems = $derived(headerCtrl.state.meta.titleMenuItems)
  const isTaskHeader = $derived.by(
    () =>
      headerResourceType === FirstClassResource.task ||
      adminCtx.activeResourceType === FirstClassResource.task,
  )
  const layoutMode = $derived(
    presentationResourceType
      ? presentationListUi.state.layoutMode[presentationResourceType]
      : 'card',
  )
  const isControlBarVisible = $derived(
    presentationResourceType
      ? presentationListUi.state.isControlBarVisible[presentationResourceType]
      : false,
  )
  const showAvatar = $derived(!appCtx.panels.state.settings.isOpen)
  const currentUser = $derived(appCtx.user ?? null)
  const currentUserName = $derived(
    currentUser?.displayUsername ??
      currentUser?.username ??
      (currentUser && 'name' in currentUser ? currentUser.name : null) ??
      null,
  )
  const currentUserImage = $derived(currentUser?.image ?? null)
  const controlsMode = $derived(headerCtrl.state.controlsMode)
  const isEditing = $derived(headerCtrl.state.isEditing)
  const visibility = $derived(headerCtrl.state.visibility)
  const resolvedHeaderTitle = $derived.by((): string => {
    const explicitTitle = headerCtrl.state.meta.title

    if (explicitTitle) return explicitTitle

    return getCachedHeaderTitle()
  })

  const headerIcon = $derived(headerCtrl.state.meta.icon)
  const headerIconHoverColor = $derived(getHeaderIconHoverColor(headerResourceType))
  const formActions = $derived(headerCtrl.state.formActions)
  const syncCrumbs = $derived.by(() => getCachedHeaderCrumbs())

  // DERIVED :: NAVIGATION
  const headerHref = $derived.by(() => {
    if (!headerResourceType) return undefined
    if (!(headerResourceType in ResourcePath)) return undefined

    if (headerResourceType === FirstClassResource.hub) {
      const actor = toHubAuthActor(appCtx.user)
      const hubId = appCtx.hub?.id ?? null
      if (!hubId) return undefined
      const decision = authorizeHubList(actor, { resourceHubId: hubId })
      if (!decision.allowed) return undefined
    }

    return `/admin/${ResourcePath[headerResourceType as FirstClassResource]}`
  })

  // DERIVED :: FORM ACTION STATE
  const isTainted = $derived(Boolean(formActions?.dirty ?? false))

  const isSubmitting = $derived(Boolean(formActions?.isSubmitting ?? false))
  const isPublishing = $derived(Boolean(formActions?.isPublishing ?? false))
  const isPublished = $derived(Boolean(formActions?.isPublished ?? false))
  const isDeleting = $derived(Boolean(formActions?.isDeleting ?? false))
  const isDeleted = $derived(Boolean(formActions?.isDeleted ?? false))
  const canEdit = $derived(Boolean(formActions?.canEdit ?? true))
  const disableEdit = $derived(Boolean(formActions?.disableEdit ?? false))
  const canPublish = $derived(Boolean(formActions?.canPublish ?? true))
  const isInFlight = $derived(isSubmitting || isPublishing || isDeleting)
  const isPublishBlocked = $derived((isEditing && isTainted) || isInFlight)
  const showDeleteAction = $derived(
    !isIndex && Boolean(formActions?.showDeleteAction ?? false),
  )
  const showPublishAction = $derived(Boolean(formActions?.showPublishAction ?? false))
  const showDeleteMenuAction = $derived(
    showDeleteAction && !isDeleted && Boolean(formActions?.toggleDelete),
  )

  const deleteMenuLabel = $derived(
    resolvedHeaderTitle
      ? `${m.forms__delete()} ${resolvedHeaderTitle}`
      : m.forms__delete(),
  )
  const publishStatusLabel = $derived(
    isPublished ? m.published() : m.forms__unpublished(),
  )
  const titleMenuItems = $derived.by((): HeaderTitleMenuItemConfig[] => {
    const items = [...titleMenuMetaItems]

    // Hierarchy changelogs open as a record view from the same menu as Delete.
    if (
      !isIndex &&
      canEdit &&
      adminCtx.activeResourceRef &&
      adminCtx.activeResourceRef !== NEW_REF &&
      ['organisation', 'project', 'layer'].includes(
        String(adminCtx.activeResourceType),
      ) &&
      !page.url.pathname.endsWith('/changelog')
    ) {
      items.push({
        label: 'Changelog',
        icon: HistoryIcon,
        onSelect: () => {
          void goto(`${page.url.pathname.replace(/\/$/, '')}/changelog`)
        },
      })
    }

    if (!showDeleteMenuAction) return items

    items.push({
      label: deleteMenuLabel,
      onSelect: handleDeleteToggle,
      icon: Trash2,
      class: 'bits-pattern-header__title-menu-item--danger',
      iconClass: 'bits-pattern-header__title-menu-item-icon',
    })

    return items
  })
  // ---
  /********************
   *  2. EFFECTS
   ************/
  // +++ Effects

  // Reset transient edit mode when the active admin resource changes.
  // New-resource routes are create flows and should remain interactive by default.
  $effect(() => {
    adminCtx.activeResourceType
    adminCtx.activeResourceRef
    headerCtrl.setEditing(adminCtx.activeResourceRef === NEW_REF)
  })

  // ---
  /********************
   *  3. VIEW ACTION HANDLERS
   ************/
  // +++ View Action Handlers

  // Navigate to the create flow for the current resource type.
  function handleCreate(): void {
    const resourceType = adminCtx.activeResourceType
    if (!resourceType) return
    navigateOnAdmin(adminCtx, resourceType, NEW_REF, 'core')
  }

  // Apply free-text search changes by updating the active resource filter source of truth.
  function handleFilterChange(nextFilterText: string): void {
    const resourceType = adminCtx.activeResourceType
    if (!resourceType || !isFilterResource(resourceType)) return
    appCtx.filters.values[resourceType].text = nextFilterText
  }

  function handleFilterFocusChange(isFocused: boolean): void {
    headerCtrl.isSearchFocused = isFocused
  }

  // Focus the first visible resource row from the header search field.
  function handleAdvanceFromSearch(): void {
    const firstItem = document.querySelector(
      '[data-entity-index="0"][tabindex], svelte-virtual-list-row [tabindex="0"], svelte-virtual-list-row [tabindex]',
    ) as HTMLElement | null

    firstItem?.focus()
  }

  // Cycle through the supported layout modes for the active resource index view.
  function handleAdvanceLayout(): void {
    const resourceType = presentationResourceType

    if (!resourceType) return

    const supportedModes = layoutModes

    if (supportedModes.length <= 1) return

    const currentMode = presentationListUi.state.layoutMode[
      resourceType
    ] as HeaderLayoutMode
    const currentIndex = Math.max(0, supportedModes.indexOf(currentMode))
    const nextMode = supportedModes[(currentIndex + 1) % supportedModes.length]

    presentationListUi.state.layoutMode[resourceType] = nextMode
  }

  // Toggle the resource control bar beneath the header.
  function handleControlsToggle(): void {
    const resourceType = presentationResourceType

    if (
      !resourceType ||
      (!isEmbeddedIndex &&
        !isFilterResource(resourceType) &&
        resourceType !== FirstClassResource.location)
    )
      return

    presentationListUi.state.isControlBarVisible[resourceType] =
      !presentationListUi.state.isControlBarVisible[resourceType]
  }

  /**
   * Activate the selected tab and persist its hash, including retries after a page fallback.
   * @param ref Facet exposed by the current header.
   * @returns Nothing.
   */
  function handleFacetChange(ref: string): void {
    if (typeof window === 'undefined') return

    // A page can fall back to Profile while the URL still names Fields. Restore
    // the selected facet even when there is no URL change for SvelteKit to project.
    adminCtx.setFacet(ref as FacetType)
    const url = new URL(window.location.href)
    url.hash = ref
    if (url.href === window.location.href) return

    // Each tab selection is a history entry, so Back/Forward can retrace form tabs.
    // Preserve application state without nesting SvelteKit's serialized history metadata.
    goto(url, { shallow: true, replace: false, state: page.state })
  }

  // ---
  /********************
   *  4. FORM ACTION HANDLERS
   ************/
  // +++ Form Action Handlers

  // Reset the current form, or exit a brand-new draft back to the resource index.
  function handleReset(): void {
    if (
      !isTainted &&
      adminCtx.activeResourceRef === NEW_REF &&
      adminCtx.activeResourceType !== false &&
      adminCtx.activeResourceType
    ) {
      navigateOnAdmin(adminCtx, adminCtx.activeResourceType)
      return
    }
    formActions?.reset?.()
  }

  // Toggle edit mode, or exit a new unsaved entity flow when editing is turned off.
  function handleEditingToggle(next: boolean): void {
    if (
      !next &&
      adminCtx.activeResourceRef === NEW_REF &&
      adminCtx.activeResourceType !== false &&
      adminCtx.activeResourceType
    ) {
      navigateOnAdmin(adminCtx, adminCtx.activeResourceType)
      return
    }
    headerCtrl.setEditing(next)
  }

  // Delegate save submission to the current form action contract.
  function handleSave(): void {
    formActions?.submit?.()
  }

  // Delegate delete-menu toggling to the current form action contract.
  function handleDeleteToggle(): void {
    formActions?.toggleDelete?.()
  }

  // Delegate publish-menu toggling to the current form action contract.
  function handlePublishToggle(): void {
    void formActions?.togglePublish?.()
  }

  // ---
  /********************
   *  5. VISIBILITY RESOLUTION
   ************/
  // +++ Visibility Resolution

  // Build automatic header visibility defaults from route shape and header control mode.
  const defaultVisibility = $derived.by(() => {
    const showLayoutToggle = isIndex && layoutModes.length > 1
    const showControlBarToggle =
      isIndex &&
      (isFilterResource(headerResourceType) ||
        headerResourceType === FirstClassResource.location)
    const showViewActionsBase = isIndex && (showLayoutToggle || showControlBarToggle)
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
      showControlBarToggle,
      showViewActions,
      showFormActions,
      showAvatar,
    }
  })

  // Merge page-level visibility overrides on top of adapter-derived defaults.
  const resolvedVisibility = $derived.by(() => ({
    showNew: visibility.showNew ?? defaultVisibility.showNew,
    showFilter:
      isEmbeddedIndex || (visibility.showFilter ?? defaultVisibility.showFilter),
    showFacets: visibility.showFacets ?? defaultVisibility.showFacets,
    showViewActions:
      isEmbeddedIndex ||
      (visibility.showViewActions ?? defaultVisibility.showViewActions),
    showFormActions:
      !isEmbeddedIndex &&
      (visibility.showFormActions ?? defaultVisibility.showFormActions),
    showAvatar: visibility.showAvatar ?? defaultVisibility.showAvatar,
    showLayoutToggle:
      isEmbeddedIndex ||
      (visibility.showLayoutToggle ?? defaultVisibility.showLayoutToggle),
    showControlBarToggle:
      isEmbeddedIndex ||
      (visibility.showControlBarToggle ?? defaultVisibility.showControlBarToggle),
  }))

  // ---
  /********************
   *  6. ACTION MODELS
   ************/
  // +++ Action Models

  const nextLayoutMode = $derived.by(() => {
    if (layoutModes.length <= 1) return null

    const currentIndex = Math.max(
      0,
      layoutModes.indexOf(layoutMode as HeaderLayoutMode),
    )
    return layoutModes[(currentIndex + 1) % layoutModes.length]
  })
  const nextLayoutActionMeta = $derived.by(() => toLayoutActionMeta(nextLayoutMode))
  const controlsAction = $derived.by((): HeaderButtonActionConfig | undefined => {
    if (!resolvedVisibility.showControlBarToggle) return undefined

    return {
      text: m.menu_filters(),
      class: 'px-4',
      color: 'neutral',
      style: 'ghost',
      icon: isControlBarVisible ? FunnelX : Funnel,
      alwaysHideLabel: true,
      hideLabelInstantly: true,
      onClick: handleControlsToggle,
    }
  })
  const layoutAction = $derived.by((): HeaderButtonActionConfig | undefined => {
    if (!resolvedVisibility.showLayoutToggle || layoutModes.length <= 1)
      return undefined
    if (!nextLayoutActionMeta) return undefined

    return {
      text: nextLayoutActionMeta.text,
      class: 'px-4',
      color: 'neutral',
      style: 'ghost',
      icon: nextLayoutActionMeta.icon,
      alwaysHideLabel: true,
      hideLabelInstantly: true,
      onClick: handleAdvanceLayout,
    }
  })
  const featuresAction = $derived.by((): HeaderButtonActionConfig | null => {
    const resourceType = adminCtx.activeResourceType
    const resourceRef = adminCtx.activeResourceRef
    if (
      !resourceRef ||
      resourceRef === NEW_REF ||
      (resourceType !== FirstClassResource.organisation &&
        resourceType !== FirstClassResource.project &&
        resourceType !== FirstClassResource.layer)
    )
      return null

    return {
      text: m.omni__title_features(),
      icon: FeatureIcon,
      disabled: isEditing || isInFlight,
      style: adminCtx.activeFacet === 'features' ? 'soft' : 'outline',
      onClick: () => navigateOnAdmin(adminCtx, resourceType, resourceRef, 'features'),
    }
  })
  // Reuse the permitted Users facet so its action keeps the same visibility and navigation.
  const usersAction = $derived.by((): HeaderButtonActionConfig | null => {
    const usersFacet = facetItems.find(item => item.ref === 'users')
    if (!usersFacet) return null

    return {
      text: usersFacet.label,
      icon: usersFacet.icon,
      disabled: isEditing || isInFlight || usersFacet.disabled,
      style:
        (customActiveFacet ?? adminCtx.activeFacet) === 'users' ? 'soft' : 'outline',
      onClick: () => (customFacetChangeHandler ?? handleFacetChange)('users'),
    }
  })
  const primaryAction = $derived.by((): HeaderButtonActionConfig | null => {
    if (!canEdit || (showDeleteAction && isDeleted)) return null

    return {
      text: !isEditing ? m.forms__edit() : isTainted ? m.forms__reset() : m.cancel(),
      color: 'neutral',
      style: isEditing ? 'ghost' : 'soft',
      icon: isEditing && isTainted ? RotateCcw : isEditing ? X : Pencil,
      class: 'bits-pattern-header__form-action-main',
      disabled: disableEdit || isInFlight,
      onClick: () => {
        if (!isEditing) {
          handleEditingToggle(true)
          return
        }

        if (!isTainted) {
          handleReset()
          handleEditingToggle(false)
          return
        }

        handleReset()
      },
    }
  })
  const saveAction = $derived.by((): HeaderButtonActionConfig | null => {
    if (!isEditing || !canEdit) return null

    return {
      text: m.forms__save(),
      color: 'primary',
      style: 'none',
      icon: isSubmitting ? LoaderCircle : Save,
      class: 'bits-pattern-header__form-action-publish',
      // Let submit revalidate the current draft and focus errors, including after a save.
      disabled: disableEdit || !isTainted || isInFlight,
      onClick: handleSave,
    }
  })
  const deleteAction = $derived.by((): HeaderButtonActionConfig | null => {
    if (!(showDeleteAction && isDeleted)) return null

    return {
      text: m.forms__restore(),
      color: 'warning',
      style: 'ghost',
      icon: isDeleting ? LoaderCircle : Undo2,
      disabled: isInFlight,
      onClick: handleDeleteToggle,
    }
  })
  const publishAction = $derived.by((): HeaderActionConfig | null => {
    if (isDeleted || !showPublishAction) return null

    if (canPublish) {
      return {
        kind: 'button' as const,
        text: isPublished ? m.forms__unpublish() : m.forms__publish(),
        color: isPublished ? ('neutral' as const) : ('primary' as const),
        style: isPublished ? ('outline' as const) : ('none' as const),
        icon: isPublishing ? LoaderCircle : isPublished ? EyeOff : Upload,
        class: 'bits-pattern-header__form-action-publish',
        disabled: isPublishBlocked,
        onClick: handlePublishToggle,
      }
    }

    return {
      kind: 'status' as const,
      text: publishStatusLabel,
      icon: isPublished ? Eye : EyeOff,
      class: 'bits-pattern-header__form-action-publish',
      ariaLive: 'polite' as const,
    }
  })

  // Preview uses the current resource's role-derived handler and saved state; keep its slot while editing.
  const previewAction = $derived.by((): HeaderButtonActionConfig | null => {
    if (isDeleted || !formActions?.preview) return null
    return {
      text: m.publication_preview__button(),
      color: 'neutral',
      style: 'outline',
      icon: Eye,
      disabled: isEditing || isInFlight,
      onClick: formActions.preview,
    }
  })

  const titleMenuAction = $derived.by(() => ({
    // Tasks never expose title-menu actions, even if shared header state is stale.
    isVisible: !isTaskHeader && titleMenuItems.length > 0,
    ariaLabel: resolvedHeaderTitle
      ? `${resolvedHeaderTitle} actions`
      : 'Header actions',
    items: isTaskHeader ? [] : titleMenuItems,
  }))

  const titleConfig = $derived.by(() => ({
    text: resolvedHeaderTitle,
    icon: (headerIcon ?? undefined) as Component | undefined,
    iconHoverColor: headerIconHoverColor,
    href: headerHref,
    crumbs: customCrumbs.length > 0 ? customCrumbs : syncCrumbs,
    menuAction: titleMenuAction,
  }))

  const inlineViewActionContent = $derived(headerCtrl.state.meta.viewActionContent)
  const renderedControlBar = $derived.by(() => headerCtrl.state.layout.controlBar)

  // ---
  /********************
   *  7. PUBLIC CONTRACT
   ************/
  // +++ Public Contract

  // Materialize the final prop object expected by the stateless header pattern.
  const headerProps = $derived<HeaderProps>({
    query: headerCtrl.state.search?.query ?? query,
    title: titleConfig,
    newAction: {
      isCreatable: resolvedVisibility.showNew,
      onCreate: handleCreate,
    },
    filter: {
      isFilterable: resolvedVisibility.showFilter,
      placeholder: headerCtrl.state.search?.placeholder ?? 'Filter resources',
      debounceMs: 150,
      onFilter: headerCtrl.state.search?.onFilter ?? handleFilterChange,
      onFocusChange: handleFilterFocusChange,
      onAdvanceFromSearch: handleAdvanceFromSearch,
    },
    facets: {
      items: resolvedVisibility.showFacets ? facetItems : [],
      active: customActiveFacet ?? adminCtx.activeFacet,
      onFacetChange: customFacetChangeHandler ?? handleFacetChange,
    },
    viewActions: {
      isVisible: resolvedVisibility.showViewActions,
      controlsAction: controlsAction ?? customViewActions[0],
      layoutAction,
      extraActions: controlsAction ? customViewActions : customViewActions.slice(1),
      content: inlineViewActionContent,
    },
    taskActions: {
      isVisible:
        customTaskActions.length > 0 || Boolean(customTaskActionContent?.component),
      actions: customTaskActions,
      content: customTaskActionContent,
    },
    formActions: {
      isVisible: resolvedVisibility.showFormActions,
      primaryAction,
      featuresAction,
      usersAction,
      saveAction,
      deleteAction,
      publishAction,
      publishPrompt: formActions?.publishPrompt ?? null,
      previewAction,
    },
    avatar: {
      isVisible: resolvedVisibility.showAvatar,
      name: currentUserName,
      src: currentUserImage,
      alt: currentUserName ?? 'Current user',
      transitionDirection: 'right',
      onClick: () => appCtx.panels.togglePanel(Panel.settings),
    },
    controlBar: renderedControlBar,
    footer: headerCtrl.state.layout.footer,
  })

  // Expose the fully derived header prop contract to the consuming layout.
  return {
    // Read the fully derived header prop contract lazily from the adapter.
    getHeaderProps: () => headerProps,
  }
  // ---
}
