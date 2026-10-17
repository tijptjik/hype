// TYPES
import type { ViewFilters } from '#lib/client/services/viewFilters.types.js'
import type { FirstClassResource } from '#lib/enums.js'
import type { Component } from 'svelte'

// Organisation filter keys

// Project filter keys

// Layer filter keys (no image filters)

// Task filter keys

// Hub filter keys (only archived status)

export type ViewFilterResource = keyof ViewFilters

export type PropertyFilterType = 'classifier' | 'specifier'

type ResourceFilterToggleKey<T extends ViewFilterResource> = Extract<
  Exclude<keyof ViewFilters[T], 'translationLocales' | 'properties'>,
  string
>

type ResourceTranslationFilterKey<T extends ViewFilterResource> = Extract<
  ResourceFilterToggleKey<T>,
  `${string}Translated`
>

export type ResourceFilterConfigBase = {
  label: string
  tooltip?: string
  invertBoolean?: boolean
  trueLabel?: string
  falseLabel?: string
  superAdminOnly?: boolean
  transformOffset?: number
  refreshResource?: FirstClassResource
}

type ResourceToggleFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'toggle'
    key: ResourceFilterToggleKey<T>
  }

type ResourceTranslationFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'translation'
    key: ResourceTranslationFilterKey<T>
  }

type ResourceSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type ResourceSelectFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'select'
    key: ResourceFilterToggleKey<T>
    placeholder?: string
    allowDeselect?: boolean
    options: ResourceSelectOption[]
  }

type ResourceFilterSectionConfig<T extends ViewFilterResource> = {
  key: string
  title: string
  icon: Component
  filters: Array<
    | ResourceToggleFilterConfig<T>
    | ResourceTranslationFilterConfig<T>
    | ResourceSelectFilterConfig<T>
  >
}

export type ResourcePropertyFilterSectionConfig = {
  key: string
  title: string
  icon: Component
  type: 'property'
  propertyType: PropertyFilterType
  falseLabel?: string
  trueLabel?: string
  transformOffset?: number
  superAdminOnly?: boolean
  refreshResource?: FirstClassResource
}

export type ResourceFilterEntryConfig = ResourceFilterConfigBase & {
  type: 'toggle' | 'translation' | 'select'
  key: string
  placeholder?: string
  allowDeselect?: boolean
  options?: ResourceSelectOption[]
}

export type ResourceFilterSection =
  | (Omit<ResourceFilterSectionConfig<ViewFilterResource>, 'filters'> & {
      filters: ResourceFilterEntryConfig[]
    })
  | ResourcePropertyFilterSectionConfig

export type ResourceControlBarConfig = {
  resource: ViewFilterResource
  sections: ResourceFilterSection[]
}
