import { getContext, setContext, untrack } from 'svelte'
import type { Component } from 'svelte'
import type {
  HeaderCtrlState,
  HeaderControlsMode,
  HeaderFacetItem,
  HeaderFormActionsState,
  HeaderVisibilityOverrides,
} from '$lib/types'
import type {
  HeaderButtonActionConfig,
  HeaderCrumb,
  HeaderLayoutRegionConfig,
  HeaderTitleMenuItemConfig,
} from '$lib/bits/patterns/layout/header/header.types'

const DEFAULT_HEADER_FORM_ACTIONS: HeaderFormActionsState = {
  dirty: false,
  reset: () => {},
  submit: () => {},
  isSubmitting: false,
  hasIssues: false,
  togglePublish: () => {},
  isPublishing: false,
  isPublished: false,
  canEdit: true,
  disableEdit: false,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  toggleDelete: () => {},
  isDeleting: false,
  isDeleted: false,
}

const HEADER_CTRL_DEBUG =
  typeof window !== 'undefined' && window.location.search.includes('debugHeaderCtrl=1')

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
      crumbs: [],
      facets: [],
      activeFacet: null,
      onFacetChange: null,
      titleMenuItems: [],
      viewActions: [],
      taskActions: [],
      taskActionContent: null,
    },
    formActions: null,
    layout: {
      controlBar: null,
      footer: null,
    },
  })

  constructor() {
    if (HEADER_CTRL_DEBUG) {
      $inspect('HeaderCtrl state', this.state)
    }
  }

  /**
   * Set which control cluster should be shown.
   * @param mode - Header controls mode.
   * @returns void
   */
  private showControls(mode: HeaderControlsMode): void {
    if (untrack(() => this.state.controlsMode) === mode) return
    this.state.controlsMode = mode
  }

  /**
   * Set edit/view mode for form-oriented pages.
   * @param isEditing - True when form fields should be editable.
   * @returns void
   */
  setEditing(isEditing: boolean): void {
    if (untrack(() => this.state.isEditing) === isEditing) return
    this.state.isEditing = isEditing
  }

  /**
   * Override header visibility flags.
   * @param overrides - Visibility overrides to apply.
   * @returns void
   */
  private setVisibility(overrides: HeaderVisibilityOverrides): void {
    if (untrack(() => shallowEqualRecord(this.state.visibility, overrides))) return
    this.state.visibility = { ...overrides }
  }

  /**
   * Set available facet tabs.
   * @param facets - Facets as map labels or fully-configured facet items.
   * @returns void
   */
  setFacets(
    facets:
      | Map<
          string,
          | string
          | {
              label: string
              icon?: Component | null
              hasIssues?: boolean
              disabled?: boolean
            }
        >
      | HeaderFacetItem[],
    options: {
      active?: string | false | null
      onFacetChange?: ((ref: string) => void) | null
    } = {},
  ): void {
    const nextFacets = this.normalizeFacetItems(facets)
    if (
      untrack(
        () =>
          isSameFacetItems(this.state.meta.facets, nextFacets) &&
          this.state.meta.activeFacet === (options.active ?? null) &&
          this.state.meta.onFacetChange === (options.onFacetChange ?? null),
      )
    )
      return
    this.state.meta.facets = nextFacets
    this.state.meta.activeFacet = options.active ?? null
    this.state.meta.onFacetChange = options.onFacetChange ?? null
  }

  /**
   * Set additional header view actions supplied by the current route.
   * @param actions - Extra action buttons rendered alongside default view actions.
   * @returns void
   */
  setViewActions(actions: HeaderButtonActionConfig[]): void {
    if (untrack(() => isSameViewActions(this.state.meta.viewActions, actions))) return
    this.state.meta.viewActions = [...actions]
  }

  /**
   * Set task-detail actions supplied by the current route.
   * @param actions - Task action buttons rendered in the form/facet cluster.
   * @returns void
   */
  setTaskActions(actions: HeaderButtonActionConfig[]): void {
    if (untrack(() => isSameViewActions(this.state.meta.taskActions, actions))) return
    this.state.meta.taskActions = [...actions]
  }

  /**
   * Set task-detail inline content rendered with the task action cluster.
   * @param component - Task-action content component constructor.
   * @param props - Props passed to the inline content component.
   * @returns void
   */
  setTaskActionContent(
    component: HeaderLayoutRegionConfig['component'],
    props: HeaderLayoutRegionConfig['props'] = {},
  ): void {
    const next = component ? { component, props } : null
    if (
      untrack(() => isSameLayoutRegionConfig(this.state.meta.taskActionContent, next))
    )
      return
    this.state.meta.taskActionContent = next
  }

  /**
   * Set an explicit breadcrumb trail supplied by the current route.
   * @param crumbs - Breadcrumbs rendered ahead of the title.
   * @returns void
   */
  setCrumbs(crumbs: HeaderCrumb[]): void {
    if (untrack(() => isSameCrumbs(this.state.meta.crumbs, crumbs))) return
    this.state.meta.crumbs = [...crumbs]
  }

  /**
   * Set custom title-menu items supplied by the current route.
   * @param items - Menu items rendered ahead of shared header actions.
   * @returns void
   */
  setTitleMenuItems(items: HeaderTitleMenuItemConfig[]): void {
    if (untrack(() => isSameTitleMenuItems(this.state.meta.titleMenuItems, items)))
      return
    this.state.meta.titleMenuItems = [...items]
  }

  /**
   * Configure header for index/list routes.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @param visibilityOverrides - Visibility overrides merged onto index defaults.
   * @returns void
   */
  setHeaderForIndex(
    title: string,
    icon: Component,
    visibilityOverrides: HeaderVisibilityOverrides = {},
  ): void {
    this.applyIndexMeta(title, icon)
    this.showControls('view')
    this.setVisibility(getIndexVisibility(visibilityOverrides))
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
    this.clearControlBar()
    this.clearFooter()
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
    facets: Map<
      string,
      | string
      | {
          label: string
          icon?: Component | null
          hasIssues?: boolean
          disabled?: boolean
        }
    >,
  ): void {
    this.applyEntityMeta(title, icon, facets)
    this.showControls('form')
    this.setVisibility(getEntityVisibility())
    this.clearControlBar()
    this.clearFooter()
  }

  /**
   * Clear header metadata while preserving controls mode/visibility.
   * @returns void
   */
  clearMeta(): void {
    this.state.meta.title = ''
    this.state.meta.icon = null
    this.state.meta.crumbs = []
    this.state.meta.facets = []
    this.state.meta.activeFacet = null
    this.state.meta.onFacetChange = null
    this.state.meta.titleMenuItems = []
    this.state.meta.viewActions = []
    this.state.meta.taskActions = []
    this.state.meta.taskActionContent = null
  }

  /**
   * Register header form actions from the current route form controller.
   * @param formActions - Partial form action handlers/state merged with defaults.
   * @returns void
   */
  setFormActions(formActions: Partial<HeaderFormActionsState>): void {
    const current = untrack(() => this.state.formActions ?? DEFAULT_HEADER_FORM_ACTIONS)
    const next = {
      ...DEFAULT_HEADER_FORM_ACTIONS,
      ...current,
      ...formActions,
    }
    if (shallowEqualRecord(current, next)) return
    this.state.formActions = next
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
    return Boolean(this.state.formActions?.isSubmitting)
  }

  /** Set submit in-flight state on header form actions. */
  setIsSubmitting(next: boolean): void {
    this.patchFormActions({ isSubmitting: next })
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
    if (untrack(() => this.state.formActions == null)) return
    this.state.formActions = null
  }

  /**
   * Register a layout-owned control bar shown directly beneath the header.
   * @param component - Control bar component constructor.
   * @param props - Props passed to the control bar component.
   * @returns void
   */
  setControlBar(
    component: HeaderLayoutRegionConfig['component'],
    props: HeaderLayoutRegionConfig['props'] = {},
    options: Pick<HeaderLayoutRegionConfig, 'height' | 'isVisible'> = {},
  ): void {
    const next = component ? { component, props, ...options } : null
    if (untrack(() => isSameLayoutRegionConfig(this.state.layout.controlBar, next)))
      return
    this.state.layout.controlBar = next
  }

  /**
   * Clear the layout-owned control bar region.
   * @returns void
   */
  clearControlBar(): void {
    if (untrack(() => this.state.layout.controlBar == null)) return
    this.state.layout.controlBar = null
  }

  /**
   * Register a layout-owned footer region.
   * @param component - Footer component constructor.
   * @param props - Props passed to the footer component.
   * @returns void
   */
  setFooter(
    component: HeaderLayoutRegionConfig['component'],
    props: HeaderLayoutRegionConfig['props'] = {},
  ): void {
    const next = component ? { component, props } : null
    if (untrack(() => isSameLayoutRegionConfig(this.state.layout.footer, next))) return
    this.state.layout.footer = next
  }

  /**
   * Clear the layout-owned footer region.
   * @returns void
   */
  clearFooter(): void {
    if (untrack(() => this.state.layout.footer == null)) return
    this.state.layout.footer = null
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
    this.clearControlBar()
    this.clearFooter()
    this.clearMeta()
  }

  /**
   * Apply base metadata for index/list pages.
   * @param title - Header title.
   * @param icon - Header icon component.
   * @returns void
   */
  private applyIndexMeta(title: string, icon: Component): void {
    if (
      untrack(
        () =>
          this.state.meta.title === title &&
          this.state.meta.icon === icon &&
          this.state.meta.crumbs.length === 0 &&
          this.state.meta.facets.length === 0 &&
          this.state.meta.activeFacet == null &&
          this.state.meta.onFacetChange == null &&
          this.state.meta.titleMenuItems.length === 0 &&
          this.state.meta.viewActions.length === 0 &&
          this.state.meta.taskActions.length === 0 &&
          this.state.meta.taskActionContent == null,
      )
    )
      return
    this.state.meta.title = title
    this.state.meta.icon = icon
    this.state.meta.crumbs = []
    this.state.meta.facets = []
    this.state.meta.activeFacet = null
    this.state.meta.onFacetChange = null
    this.state.meta.titleMenuItems = []
    this.state.meta.viewActions = []
    this.state.meta.taskActions = []
    this.state.meta.taskActionContent = null
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
    facets: Map<
      string,
      | string
      | {
          label: string
          icon?: Component | null
          hasIssues?: boolean
          disabled?: boolean
        }
    >,
  ): void {
    const nextFacets = this.normalizeFacetItems(facets)
    if (
      untrack(
        () =>
          this.state.meta.title === title &&
          this.state.meta.icon === icon &&
          isSameFacetItems(this.state.meta.facets, nextFacets) &&
          this.state.meta.crumbs.length === 0 &&
          this.state.meta.activeFacet == null &&
          this.state.meta.onFacetChange == null &&
          this.state.meta.titleMenuItems.length === 0 &&
          this.state.meta.viewActions.length === 0 &&
          this.state.meta.taskActions.length === 0 &&
          this.state.meta.taskActionContent == null,
      )
    )
      return

    this.state.meta.title = title
    this.state.meta.icon = icon
    this.state.meta.crumbs = []
    this.state.meta.facets = nextFacets
    this.state.meta.activeFacet = null
    this.state.meta.onFacetChange = null
    this.state.meta.titleMenuItems = []
    this.state.meta.viewActions = []
    this.state.meta.taskActions = []
    this.state.meta.taskActionContent = null
  }

  /**
   * Normalize facet input into the internal facet item shape.
   * @param facets - Facets as map labels or fully-configured facet items.
   * @returns Normalized facet items.
   */
  private normalizeFacetItems(
    facets:
      | Map<
          string,
          | string
          | {
              label: string
              icon?: Component | null
              hasIssues?: boolean
              disabled?: boolean
            }
        >
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
              disabled: false,
            }
          }
          return {
            ref,
            label: value.label,
            icon: value.icon ?? null,
            hasIssues: value.hasIssues === true,
            disabled: value.disabled === true,
          }
        })
  }

  /**
   * Patch existing form actions while preserving current handlers/state defaults.
   * @param patch - Partial action state to merge.
   * @returns void
   */
  private patchFormActions(patch: Partial<HeaderFormActionsState>): void {
    const current = untrack(() => this.state.formActions ?? {})
    this.setFormActions({
      ...current,
      ...patch,
    })
  }
}

function shallowEqualRecord(left: object, right: object): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(key =>
    isComparableValueEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ),
  )
}

function isComparableValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  if (!isComparableObject(left) || !isComparableObject(right)) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false

    return left.every((value, index) => isComparableValueEqual(value, right[index]))
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(key =>
    isComparableValueEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ),
  )
}

function isComparableObject(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null
}

function isSameFacetItems(left: HeaderFacetItem[], right: HeaderFacetItem[]): boolean {
  if (left.length !== right.length) return false

  return left.every((item, index) => {
    const next = right[index]
    return (
      item?.ref === next?.ref &&
      item?.label === next?.label &&
      item?.icon === next?.icon &&
      item?.hasIssues === next?.hasIssues &&
      item?.disabled === next?.disabled
    )
  })
}

function isSameViewActions(
  left: HeaderButtonActionConfig[],
  right: HeaderButtonActionConfig[],
): boolean {
  if (left.length !== right.length) return false

  return left.every((action, index) => isComparableValueEqual(action, right[index]))
}

function isSameCrumbs(left: HeaderCrumb[], right: HeaderCrumb[]): boolean {
  if (left.length !== right.length) return false

  return left.every((crumb, index) => {
    const next = right[index]
    return crumb?.name === next?.name && crumb?.href === next?.href
  })
}

function isSameLayoutRegionConfig(
  left: HeaderLayoutRegionConfig | null,
  right: HeaderLayoutRegionConfig | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false

  return (
    left.component === right.component &&
    left.isVisible === right.isVisible &&
    left.height === right.height &&
    shallowEqualRecord(left.props ?? {}, right.props ?? {})
  )
}

function isSameTitleMenuItems(
  left: HeaderTitleMenuItemConfig[],
  right: HeaderTitleMenuItemConfig[],
): boolean {
  if (left.length !== right.length) return false

  return left.every((item, index) => {
    const next = right[index]
    return (
      item?.label === next?.label &&
      item?.onSelect === next?.onSelect &&
      item?.icon === next?.icon &&
      item?.class === next?.class &&
      item?.iconClass === next?.iconClass &&
      item?.disabled === next?.disabled
    )
  })
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
