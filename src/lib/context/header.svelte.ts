import { getContext, setContext } from 'svelte'
import type { Component } from 'svelte'
import type {
  FacetType,
  HeaderCtrlState,
  HeaderControlsMode,
  HeaderFacetItem,
  HeaderVisibilityOverrides,
} from '$lib/types'

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

export class HeaderCtrl {
  state: HeaderCtrlState = $state({
    controlsMode: 'auto',
    visibility: {},
    meta: {
      title: '',
      icon: null,
      facets: [],
    },
  })

  showControls(mode: HeaderControlsMode): void {
    this.state.controlsMode = mode
  }

  setVisibility(overrides: HeaderVisibilityOverrides): void {
    this.state.visibility = { ...overrides }
  }

  setTitle(title: string): void {
    this.state.meta.title = title
  }

  setIcon(icon: Component | null): void {
    this.state.meta.icon = icon
  }

  setFacets(facets: Map<FacetType, string> | HeaderFacetItem[]): void {
    this.state.meta.facets = Array.isArray(facets)
      ? facets
      : Array.from(facets.entries()).map(([ref, label]) => ({ ref, label }))
  }

  setIndexHeader(title: string, icon: Component): void {
    this.state.meta.title = title
    this.state.meta.icon = icon
    this.state.meta.facets = []
  }

  setEntityHeader(
    title: string,
    icon: Component,
    facets: Map<FacetType, string>,
  ): void {
    this.state.meta.title = title
    this.state.meta.icon = icon
    this.setFacets(facets)
  }

  clearMeta(): void {
    this.state.meta.title = ''
    this.state.meta.icon = null
    this.state.meta.facets = []
  }

  reset(): void {
    this.state.controlsMode = 'auto'
    this.state.visibility = {}
    this.clearMeta()
  }
}

export const HEADER_CTRL_KEY = Symbol('headerCtrl')

export const setHeaderCtrl = (): HeaderCtrl => {
  return setContext(HEADER_CTRL_KEY, new HeaderCtrl())
}

export const getHeaderCtrl = (): HeaderCtrl => {
  const ctrl = getContext<HeaderCtrl | undefined>(HEADER_CTRL_KEY)
  if (!ctrl) {
    throw new Error(
      'HeaderCtrl context is missing. Ensure setHeaderCtrl() is called before using getHeaderCtrl().',
    )
  }
  return ctrl
}
