// SVELTE
import { onMount } from 'svelte'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// LABELS
import { getResourcePanelShortName } from './resourcePanelLabels'
// CONTEXT
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
// NAVIGATION
import {
  getSupportedFacetForResource,
  navigateOnAdminById,
  navigateOnAdmin,
  navigate,
} from '#lib/navigation/index.js'
// ENUMS
import { FirstClassResource, OmniMode, Panel } from '#lib/enums.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type {
  ResourcePanelModel,
  ResourcePanelRow,
  ResourcePanelSection,
} from '#lib/bits/patterns/resourcePanel/index.js'
import type { Resource } from '#lib/types.js'
import type { PanelResourceType } from '#lib/api/services/resourcePage.types.js'

/**
 * Maps shared cache queries and selection/navigation intent into a render-only panel.
 * @param app - Route-owned application context.
 * @param mode - Public prism selection or administration navigation.
 * @param admin - Administration navigation context when applicable.
 * @param omni - Map feature-card navigation context when applicable.
 * @returns Controlled panel state, rows and callbacks; no context reaches the pattern.
 * @remarks Native queries stay in this adapter so panel and index mutations share cache handles.
 */
export function useResourcePanelModel(
  app: AppCtx,
  mode: 'admin' | 'prisms',
  admin?: AdminCtx,
  omni?: OmniCtx,
): ResourcePanelModel {
  const panelType = mode === 'admin' ? Panel.admin : Panel.prisms
  let search = $state({ organisation: '', project: '', layer: '' })
  let tall = $state(false)
  onMount(() => {
    tall = window.innerHeight > 1000
  })
  const types = ['organisation', 'project', 'layer'] as const
  const lists = types.map(type => usePanelResources(app, type, () => search[type]))

  /** Keeps feature-card navigation consistent after disabling or isolating its layer. */
  function closeExcludedFeature(): void {
    const active = app.getActiveFeature()
    if (active && !app.state.prisms.layer.includes(active.layerId)) {
      navigate('/')
      omni?.setMode(OmniMode.search)
    }
  }

  /**
   * Executes the resource's primary map-selection or administration action.
   * @param type - Resource level whose defaults or layer selection should change.
   * @param id - Selected resource identity.
   * @returns Completion of selection or navigation.
   * @remarks Public row clicks leave organisation and project prism filters unchanged.
   */
  async function primary(type: PanelResourceType, id: string): Promise<void> {
    if (mode === 'admin') {
      if (app.getActiveResourceType() === type && app.getActiveResourceId() === id)
        await toggle(type, id)
      else if (admin)
        await navigateOnAdminById(
          admin,
          FirstClassResource[type],
          id,
          getSupportedFacetForResource(FirstClassResource[type], app.getActiveFacet()),
        )
      return
    }
    if (type === 'organisation') {
      if (app.isOrganisationDefaultLayersActive(id))
        await app.deactivateOrganisationLayers(id)
      else await app.addOrganisationDefaultLayers(id)
    } else if (type === 'project') {
      if (app.isProjectDefaultLayersActive(id)) await app.deactivateProjectLayers(id)
      else await app.addProjectDefaultLayers(id)
    } else {
      await app.toggleLayer(id)
      closeExcludedFeature()
    }
  }

  /**
   * Toggles a pin/prism without confusing selection with current page membership.
   * @param type - Hierarchy level to filter, or active layer to toggle.
   * @param id - Resource identity.
   * @returns Completion of the dependent refresh.
   * @remarks Organisation and project filters do not activate default layers.
   */
  async function toggle(type: PanelResourceType, id: string): Promise<void> {
    if (type === 'organisation') {
      await app.toggleOrganisation(id)
    } else if (type === 'project') {
      await app.toggleProject(id)
    } else {
      await app.toggleLayer(id)
      closeExcludedFeature()
    }
  }

  /**
   * Builds directly joined breadcrumb labels and action callbacks for visible rows.
   * @param type - Resource level to present.
   * @param index - Corresponding query-list index.
   * @returns Rows sorted with selected and enabled resources first.
   */
  function rows(type: PanelResourceType, index: number): ResourcePanelRow[] {
    const selected = app.state.prisms[type]
    return lists[index].rows
      .filter(row => !row.isArchived)
      .map(resource => {
        const record = resource as unknown as Resource
        const name = getI18n(record, 'name', app.getUserPreferences())
        const hierarchy = app.getHierarchySync(
          record as Parameters<AppCtx['getHierarchySync']>[0],
        )
        const breadcrumbs = [
          type !== 'organisation' ? hierarchy.organisation : undefined,
          type === 'layer' ? hierarchy.project : undefined,
        ]
          .filter(Boolean)
          .map(ancestor =>
            getResourcePanelShortName(
              ancestor,
              app.getUserPreferences(),
              ancestor?.code ?? '',
            ),
          )
          .filter(label => label.length > 0)
        const pinned = selected.includes(resource.id)
        const active =
          app.getActiveResourceType() === type &&
          app.getActiveResourceId() === resource.id
        const enabled =
          type === 'organisation'
            ? app.isOrganisationDefaultLayersActive(resource.id)
            : type === 'project'
              ? app.isProjectDefaultLayersActive(resource.id)
              : pinned
        return {
          id: resource.id,
          name,
          shortName: getResourcePanelShortName(record, app.getUserPreferences(), name),
          breadcrumbs,
          selected: pinned,
          active,
          enabled,
          primaryLabel:
            mode === 'admin'
              ? m.panel__open({ name })
              : enabled
                ? m.panel__deactivate_layer({ name })
                : m.panel__activate_layer({ name }),
          toggleLabel: pinned ? m.panel__unpin({ name }) : m.panel__pin({ name }),
          onPrimary: () => primary(type, resource.id),
          onToggle: () => toggle(type, resource.id),
          ...(mode === 'prisms' && type === 'layer'
            ? {
                onIsolate: async () => {
                  await app.isolateLayer(resource.id)
                  closeExcludedFeature()
                },
              }
            : {}),
        }
      })
      .sort(
        (a, b) =>
          Number(b.selected || b.active || b.enabled) -
          Number(a.selected || a.active || a.enabled),
      )
  }

  const sections: ResourcePanelSection[] = types.map((type, index) => ({
    id: type,
    get title() {
      return type === 'organisation'
        ? m.maps__organisations()
        : type === 'project'
          ? m.maps__projects()
          : m.maps__layers()
    },
    get search() {
      return search[type]
    },
    get rows() {
      return rows(type, index)
    },
    get loading() {
      return lists[index].list.loading
    },
    get error() {
      return Boolean(lists[index].list.error)
    },
    get viewKey() {
      return lists[index].viewKey
    },
    get defaultOpen() {
      return mode === 'admin' || tall
    },
    onSearch: value => {
      search[type] = value
    },
    onReset: () => {
      if (!app.state.prisms[type].length) app.closePanel(panelType)
      else if (type === 'organisation') app.resetOrganisations()
      else if (type === 'project') app.resetProjects()
      else app.resetLayers()
    },
    onNext: () => lists[index].list.next(),
    onRetry: lists[index].retry,
    onVisible: visible => {
      lists[index].list.visibleIds = new Set(visible.map(row => row.id))
    },
    ...(admin
      ? { onNavigate: () => navigateOnAdmin(admin, FirstClassResource[type]) }
      : {}),
  }))
  return {
    get panel() {
      return {
        panelType,
        position: 'left' as const,
        inline: mode === 'admin' || app.isAdmin(),
        scrollable: false,
        isAdmin: mode === 'admin',
        isNarrow: mode === 'admin' && app.isPanelNarrow(Panel.admin),
      }
    },
    get open() {
      return (
        app.isPanelOpen(panelType) ||
        app.isPanelOpenVisually(panelType) ||
        (mode === 'admin' && app.isPanelNarrow(Panel.admin))
      )
    },
    get title() {
      return mode === 'admin' ? m.menu_admin() : m.maps__title()
    },
    sections,
    onClose: () => {
      if (mode === 'admin') {
        app.closePanelVisually(panelType)
        app.togglePanel(panelType)
      } else app.closePanel(panelType)
    },
    // Map pages refresh silently while the user explores; only failures need panel feedback.
    get loadError() {
      return mode === 'prisms' && app.featureLoadState === 'error'
    },
    onRetryFeatures: () => {
      void app.refreshFeatures(false).catch(() => {})
    },
  }
}
