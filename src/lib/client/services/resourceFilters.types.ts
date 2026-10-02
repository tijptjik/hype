// TYPES
import type { ViewFilters } from '#lib/client/services/viewFilters.types.js'
import type { FirstClassResource } from '#lib/enums.js'
import type { Component } from 'svelte'

// Organisation filter keys
type OrganisationStatusFilterKey = 'isPublished' | 'isArchived'

type OrganisationTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'

type OrganisationAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'

type OrganisationImageFilterKey = 'hasImage'

// Project filter keys
type ProjectStatusFilterKey = 'isPublished' | 'isArchived'

type ProjectTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'

type ProjectAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'

type ProjectImageFilterKey = 'hasImage'

// Layer filter keys (no image filters)
type LayerStatusFilterKey = 'isPublished' | 'isArchived'

type LayerTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'

type LayerAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'

type FeatureStatusFilterKey =
  | 'isPublished'
  | 'isPendingReview'
  | 'isArchived'
  | 'isIntangible'
  | 'isVisitable'

type FeatureAuthorshipFilterKey =
  | 'hasTitle'
  | 'hasDescription'
  | 'hasDisplayAddress'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'

type FeatureImageFilterKey = 'hasImage' | 'isOneImagePublished' | 'isAllImagePublished'

// Task filter keys
type TaskStatusFilterKey = 'isReviewed' | 'reviewOutcome' | 'reviewAction' | 'type'

// Hub filter keys (only archived status)
type HubStatusFilterKey = 'isArchived'

type HubTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'

type HubAuthorshipFilterKey = 'hasName' | 'hasContextualName' | 'hasDescription'

type HubImageFilterKey = 'hasImage'

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
