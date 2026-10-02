// TYPES
import type { LocaleKey, Id } from '#lib/types.js'
import type { ReviewAction, TaskType } from '#lib/api/services/taskReview.js'

/* ----------------- */
// VIEW FILTERS (TIER 3)
/* -------- */
export type FilterTriState = boolean | null

type LocalisedFilterTriState = Record<LocaleKey, FilterTriState>

export type FeatureViewFilters = {
  // Status related
  isPublished: FilterTriState
  isPendingReview: FilterTriState
  isIntangible: FilterTriState
  isVisitable: FilterTriState
  isArchived: FilterTriState

  // Image related
  hasImage: FilterTriState
  isOneImagePublished: FilterTriState
  isAllImagePublished: FilterTriState

  // Authorship related
  hasTitle: FilterTriState
  hasDescription: FilterTriState
  hasDisplayAddress: FilterTriState
  isAllRightsReserved: FilterTriState
  isPublicDomain: FilterTriState
  hasLicenseBy: FilterTriState
  hasLicenseSa: FilterTriState
  hasLicenseNc: FilterTriState
  hasLicenseNd: FilterTriState

  // Translation related (per locale)
  translationLocales: Record<LocaleKey, boolean> // Which locales to consider for translation filters
  isTitleTranslated: LocalisedFilterTriState
  isDescriptionTranslated: LocalisedFilterTriState
  isAddressTranslated: LocalisedFilterTriState
  isSpecifierTranslated: LocalisedFilterTriState

  // Property related
  properties: Record<Id, FilterTriState> // propertyId -> state
}

type OrganisationViewFilters = {
  // Status related
  isPublished: FilterTriState
  isArchived: FilterTriState

  // Image related
  hasImage: FilterTriState

  // Authorship related
  hasName: FilterTriState
  hasContextualName: FilterTriState
  hasDescription: FilterTriState

  // Translation related (per locale)
  translationLocales: Record<LocaleKey, boolean>
  isNameTranslated: LocalisedFilterTriState
  isContextualNameTranslated: LocalisedFilterTriState
  isDescriptionTranslated: LocalisedFilterTriState
}

type ProjectViewFilters = {
  // Status related
  isPublished: FilterTriState
  isArchived: FilterTriState

  // Image related
  hasImage: FilterTriState

  // Authorship related
  hasName: FilterTriState
  hasContextualName: FilterTriState
  hasDescription: FilterTriState
  isAllRightsReserved: FilterTriState
  isPublicDomain: FilterTriState
  hasLicenseBy: FilterTriState
  hasLicenseSa: FilterTriState
  hasLicenseNc: FilterTriState
  hasLicenseNd: FilterTriState

  // Translation related (per locale)
  translationLocales: Record<LocaleKey, boolean>
  isNameTranslated: LocalisedFilterTriState
  isContextualNameTranslated: LocalisedFilterTriState
  isDescriptionTranslated: LocalisedFilterTriState
}

type LayerViewFilters = {
  // Status related
  isPublished: FilterTriState
  isArchived: FilterTriState

  // Authorship related
  hasName: FilterTriState
  hasContextualName: FilterTriState
  hasDescription: FilterTriState
  isAllRightsReserved: FilterTriState
  isPublicDomain: FilterTriState
  hasLicenseBy: FilterTriState
  hasLicenseSa: FilterTriState
  hasLicenseNc: FilterTriState
  hasLicenseNd: FilterTriState

  // Translation related (per locale)
  translationLocales: Record<LocaleKey, boolean>
  isNameTranslated: LocalisedFilterTriState
  isContextualNameTranslated: LocalisedFilterTriState
  isDescriptionTranslated: LocalisedFilterTriState
}

type TaskViewFilters = {
  // Status related
  isReviewed: FilterTriState
  reviewOutcome: FilterTriState
  reviewAction: ReviewAction | null
  type: TaskType | null
}

type HubViewFilters = {
  // Status related
  isArchived: FilterTriState

  // Image related
  hasImage: FilterTriState

  // Authorship related
  hasName: FilterTriState
  hasContextualName: FilterTriState
  hasDescription: FilterTriState

  // Translation related (per locale)
  translationLocales: Record<LocaleKey, boolean>
  isNameTranslated: LocalisedFilterTriState
  isContextualNameTranslated: LocalisedFilterTriState
  isDescriptionTranslated: LocalisedFilterTriState
}

export type ViewFilters = {
  organisation: OrganisationViewFilters
  project: ProjectViewFilters
  layer: LayerViewFilters
  feature: FeatureViewFilters
  task: TaskViewFilters
  hub: HubViewFilters
}
