import { getContext, setContext } from 'svelte'
import type { Component } from 'svelte'
import type {
  FacetType,
  HeaderCtrlState,
  HeaderControlsMode,
  HeaderFacetItem,
  HeaderFormActionsState,
  HeaderVisibilityOverrides,
} from '$lib/types'

const DEFAULT_HEADER_FORM_ACTIONS: HeaderFormActionsState = {
  dirty: false,
  reset: () => {},
  submit: () => {},
  submitting: false,
  hasIssues: false,
  togglePublish: () => {},
  isPublishing: false,
  isPublished: false,
  toggleDelete: () => {},
  isDeleting: false,
  isDeleted: false,
}

/**
 * Build the default visibility profile for index/list routes.
 * @param overrides - Optional visibility overrides merged onto defaults.
 * @returns Visibility configuration for index pages.
 */
export const getIndexVisibility = (
  overrides: HeaderVisibilityOverrides = {},
): HeaderVisibilityOverrides => ({
  showNew: true,
  showFilter: true,
  showFacets: false,
  showViewActions: true,
  showFormActions: false,
  ...overrides,
})

/**
 * Build the default visibility profile for entity/detail routes.
 * @param overrides - Optional visibility overrides merged onto defaults.
 * @returns Visibility configuration for entity pages.
 */
export const getEntityVisibility = (
  overrides: HeaderVisibilityOverrides = {},
): HeaderVisibilityOverrides => ({
  showNew: false,
  showFilter: false,
  showFacets: true,
  showViewActions: false,
  showFormActions: true,
  ...overrides,
})

/**
 * Central controller for header UI state.
 * @remarks
 * Public methods are intended for route/page usage.
 * Private methods are internal composition helpers.
 */
export class HeaderCtrl {
  /** Reactive header state consumed by the header adapter/components. */
  state: HeaderCtrlState = $state({
    controlsMode: 'auto',
    isEditing: false,
    visibility: {},
    meta: {
      title: '',
      icon: null,
      facets: [],
    },
    formActions: null,
  })

  /**
   * Set which control cluster should be shown.
   * @param mode - Header controls mode.
   * @returns void
   */
  private showControls(mode: HeaderControlsMode): void {
    this.state.controlsMode = mode
  }

  /**
   * Set edit/view mode for form-oriented pages.
   * @param isEditing - True when form fields should be editable.
   * @returns void
   */
  setEditing(isEditing: boolean): void {
    this.state.isEditing = isEditing
  }

  /**
   * Override header visibility flags.
   * @param overrides - Visibility overrides to apply.
   * @returns void
   */
  private setVisibility(overrides: HeaderVisibilityOverrides): void {
    this.state.visibility = { ...overrides }
  }

  /**
   * Set available facet tabs.
   * @param facets - Facets as map labels or fully-configured facet items.
   * @returns void
   */
  setFacets(
    facets:
      | Map<FacetType, string | { label: string; icon?: Component | null }>
      | HeaderFacetItem[],
  ): void {
    this.state.meta.facets = this.normalizeFacetItems(facets)
  }

  /**
   * Configure header for index/list routes.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @returns void
   */
  setHeaderForIndex(title: string, icon: Component): void {
    this.applyIndexMeta(title, icon)
    this.showControls('view')
    this.setVisibility(getIndexVisibility())
  }

  /**
   * Configure header for stand-alone index-like pages.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @param visibilityOverrides - Visibility overrides merged onto index defaults.
   * @returns void
   */
  setHeaderForStandAlone(
    title: string,
    icon: Component,
    visibilityOverrides: HeaderVisibilityOverrides = {},
  ): void {
    this.applyIndexMeta(title, icon)
    this.showControls('none')
    this.setVisibility(getIndexVisibility(visibilityOverrides))
  }

  /**
   * Configure header for entity/detail routes.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @param facets - Facets to render for the entity page.
   * @returns void
   */
  setHeaderForEntity(
    title: string,
    icon: Component,
    facets: Map<FacetType, string | { label: string; icon?: Component | null }>,
  ): void {
    this.applyEntityMeta(title, icon, facets)
    this.showControls('form')
    this.setVisibility(getEntityVisibility())
  }

  /**
   * Clear header metadata while preserving controls mode/visibility.
   * @returns void
   */
  clearMeta(): void {
    this.state.meta.title = ''
    this.state.meta.icon = null
    this.state.meta.facets = []
  }

  /**
   * Register header form actions from the current route form controller.
   * @param formActions - Partial form action handlers/state merged with defaults.
   * @returns void
   */
  setFormActions(formActions: Partial<HeaderFormActionsState>): void {
    this.state.formActions = {
      ...DEFAULT_HEADER_FORM_ACTIONS,
      ...formActions,
    }
  }

  /** Read publish in-flight state from header form actions. */
  getPublishing(): boolean {
    return Boolean(this.state.formActions?.isPublishing)
  }

  /** Set publish in-flight state on header form actions. */
  setPublishing(next: boolean): void {
    this.patchFormActions({ isPublishing: next })
  }

  /** Read submit in-flight state from header form actions. */
  getIsSubmitting(): boolean {
    return Boolean(this.state.formActions?.submitting)
  }

  /** Set submit in-flight state on header form actions. */
  setIsSubmitting(next: boolean): void {
    this.patchFormActions({ submitting: next })
  }

  /** Read delete in-flight state from header form actions. */
  getDeleting(): boolean {
    return Boolean(this.state.formActions?.isDeleting)
  }

  /** Set delete in-flight state on header form actions. */
  setDeleting(next: boolean): void {
    this.patchFormActions({ isDeleting: next })
  }

  /**
   * Clear route-provided form actions.
   * @returns void
   */
  clearFormActions(): void {
    this.state.formActions = null
  }

  /**
   * Fully reset header controls, visibility, and metadata.
   * @returns void
   */
  reset(): void {
    this.state.controlsMode = 'auto'
    this.state.isEditing = false
    this.state.visibility = {}
    this.state.formActions = null
    this.clearMeta()
  }

  /**
   * Apply base metadata for index/list pages.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @returns void
   */
  private applyIndexMeta(title: string, icon: Component): void {
    this.state.meta.title = title
    this.state.meta.icon = icon
    this.state.meta.facets = []
  }

  /**
   * Apply base metadata for entity/detail pages.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @param facets - Facets for the entity page.
   * @returns void
   */
  private applyEntityMeta(
    title: string,
    icon: Component,
    facets: Map<FacetType, string | { label: string; icon?: Component | null }>,
  ): void {
    this.state.meta.title = title
    this.state.meta.icon = icon
    this.setFacets(facets)
  }

  /**
   * Normalize facet input into the internal facet item shape.
   * @param facets - Facets as map labels or fully-configured facet items.
   * @returns Normalized facet items.
   */
  private normalizeFacetItems(
    facets:
      | Map<FacetType, string | { label: string; icon?: Component | null }>
      | HeaderFacetItem[],
  ): HeaderFacetItem[] {
    return Array.isArray(facets)
      ? facets
      : Array.from(facets.entries()).map(([ref, value]) => {
          if (typeof value === 'string') {
            return {
              ref,
              label: value,
              icon: null,
            }
          }
          return {
            ref,
            label: value.label,
            icon: value.icon ?? null,
          }
        })
  }

  /**
   * Patch existing form actions while preserving current handlers/state defaults.
   * @param patch - Partial action state to merge.
   * @returns void
   */
  private patchFormActions(patch: Partial<HeaderFormActionsState>): void {
    this.setFormActions({
      ...(this.state.formActions ?? {}),
      ...patch,
    })
  }
}

export const HEADER_CTRL_KEY = Symbol('headerCtrl')

/**
 * Create and register a header controller in Svelte context.
 * @returns The created header controller.
 */
export const setHeaderCtrl = (): HeaderCtrl => {
  return setContext(HEADER_CTRL_KEY, new HeaderCtrl())
}

/**
 * Read the header controller from Svelte context.
 * @returns Active header controller.
 * @throws Error when context has not been initialized.
 */
export const getHeaderCtrl = (): HeaderCtrl => {
  const ctrl = getContext<HeaderCtrl | undefined>(HEADER_CTRL_KEY)
  if (!ctrl) {
    throw new Error(
      'HeaderCtrl context is missing. Ensure setHeaderCtrl() is called before using getHeaderCtrl().',
    )
  }
  return ctrl
}
