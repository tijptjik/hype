// ZOD SCHEMAS
import type { StandardSchemaV1 } from '@standard-schema/spec'
// ENUMS
import {
  type ImageContextResource,
  type ImageContextResourceExtended,
  type FirstClassResource,
  type SupportedLocales,
  type FieldDiscriminator as FieldDiscriminatorEnum,
  TaskType as TaskTypeEnum,
  TaskReviewOutcome,
  type Panel,
  type OmniMode,
  type OmniCollection,
} from './enums'
// ZOD SCHEMAS
import type { Task, TaskNew, TaskDB } from './db/zod'
import type {
  Hub,
  HubDB,
  HubEntityByProfile,
  HubGetParamsByProfile,
  HubListByProfile,
  HubListParamsByProfile,
  HubNew,
  HubProfile,
  HubRole,
} from './db/zod/schema/hub.types'
import type {
  Layer,
  LayerDB,
  LayerEntityByProfile,
  LayerGetParamsByProfile,
  LayerI18nDB,
  LayerListByProfile,
  LayerListParamsByProfile,
  LayerNew,
  LayerProfile,
} from './db/zod/schema/layer.types'
import type { UserFeature, UserProfile } from './db/zod/schema/user.types'
import type {
  Organisation,
  OrganisationDB,
  OrganisationEntityByProfile,
  OrganisationGetParamsByProfile,
  OrganisationI18nDB,
  OrganisationListByProfile,
  OrganisationListParamsByProfile,
  OrganisationNew,
  OrganisationProfile,
  OrganisationRole,
} from './db/zod/schema/organisation.types'
import type {
  Project,
  ProjectDB,
  ProjectI18nDB,
  ProjectNew,
  ProjectRole,
} from './db/zod/schema/project.types'
import type {
  Image,
  ImageContextEnvelope,
  ImageCtxEnvelope,
  ImageDB,
  ImageUpload,
  LoadStatus,
} from './db/zod/schema/image.types'
import type {
  Feature,
  FeatureDB,
  FeatureFromCollection,
  FeatureI18nDB,
  FeatureNew,
  UserContributedFeature,
} from './db/zod/schema/feature.types'
import type { Property } from './db/zod/schema/property.types'
// TYPES
import type { Component, Snippet } from 'svelte'
import type { RemoteFormIssue } from '@sveltejs/kit'
import type { RequestEvent } from '@sveltejs/kit'
import type { AdminCtx } from './context/admin.svelte'
import type {
  FormPath,
  InputConstraints,
  TaintedFields,
  FormPathLeaves,
  ValidateOptions,
  FormPathType,
  SuperValidated,
  ValidationErrors,
} from 'sveltekit-superforms'
import type { enhance } from '$app/forms'
import type { Marker } from 'maplibre-gl'
import type { Writable } from 'svelte/store'
import type { SvelteMap, SvelteSet } from 'svelte/reactivity'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  HeaderButtonActionConfig,
  HeaderCrumb,
  HeaderLayoutRegionConfig,
  HeaderTitleMenuItemConfig,
} from './bits/patterns/layout/header/header.types'

type FieldComponentCtor = abstract new (...args: never[]) => unknown
type LayerFormType = unknown
type OrganisationFormType = unknown
type ProjectFormType = unknown
type FeatureFormType = unknown
type HubFormType = unknown
import type { SQLiteTable, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core'
import type {
  SessionSession as BetterAuthSessionSession,
  SessionUser as BetterAuthSessionUser,
} from './auth'
import type { setupRequestHandler } from '$lib/api'

/* ----------------- */
// NAMING CONVENTIONS
//
// ModelBase : SelectSchema(Model)
// ModelInsert : InsertSchema(Model)
// ModelUpdate : UpdateSchema(Model)
//
// ModelI18nBase : SelectSchema(ModelI18n)
// ModelI18nInsert : InsertSchema(ModelI18n)
// ModelI18nUpdate : UpdateSchema(ModelI18n)
// ModelI18nByLocale : ModelI18nBase.map()
// ModelI18nInsertByLocale : ModelI18nInsert.map()
// ModelI18nUpdateByLocale : ModelI18nUpdate.map()
//
// ModelAPI : ModelBase.extend({
//   i18n : ModelI18nByLocale,
//   roles : ModelRole[],
//   ...
// })
//
// ModelInsertAPI : ModelInsert.extend({
//   i18n : ModelI18nInsertByLocale,
//   roles : ModelRoleInsert[],
//   ...
// })
//
// ModelUpdateAPI : ModelUpdate.extend({
//   i18n : ModelI18nUpdateByLocale,
//   roles : ModelRoleUpdate[],
//   ...
// })
//
// The types inferred from the schemas above are as follows:
//
// ModelDB : ModelBase
// ModelDBNew : ModelInsert
// ModelDBPartial : ModelUpdate
//
// ModelI18nDB : ModelI18nBase
// ModelI18nNew : ModelI18nInsert
// ModelI18nPartial : ModelI18nUpdate
// ModelByLocale : ModelI18nByLocale
// ModelInsertByLocale : ModelI18nInsertByLocale
// ModelUpdateByLocale : ModelI18nUpdateByLocale
//
// Model : ModelAPI
// ModelNew : ModelInsertAPI
// ModelPartial : ModelUpdateAPI

/* ----------------- */
// DATABASE
/* -------- */

// Drizzle Database
export type Database = DrizzleD1Database<typeof import('$lib/db/schema')>

export type GuardedBaseContext = Awaited<ReturnType<typeof setupRequestHandler>> & {
  event: RequestEvent
}
export type GuardedQueryContext = GuardedBaseContext
export type GuardedInvalid = (...issues: StandardSchemaV1.Issue[]) => never
export type GuardedIssueResolver = (message: string) => StandardSchemaV1.Issue
export type GuardedIssue = GuardedIssueResolver & {
  data: Record<string, GuardedIssueResolver>
}
export type GuardedFormContext = GuardedBaseContext & {
  invalid: GuardedInvalid
  issue: GuardedIssue
}
export type GuardedCommandContext = GuardedBaseContext
export type SetupRequestEvent = Parameters<typeof setupRequestHandler>[0]
export type GuardedContextResolver = (payload?: unknown) => Promise<GuardedBaseContext>

export type HubProbe = {
  id: string
  code: string
  isPublished: boolean
  isArchived: boolean
}

export type HubUpdateProbe = {
  id: string
  code: string
  modifiedAt: string
}

export type HubCommandProbe = {
  id: string
}

export type OrganisationProbe = {
  id: string
  hubId: string | null
  isPublished: boolean
  isArchived: boolean
}

export type OrganisationUpdateProbe = {
  id: string
  code: string
  hubId: string | null
  capabilities?: CapabilityDefinitions | null
  modifiedAt: string
}

export type OrganisationCommandProbe = {
  id: string
  hubId: string | null
}

export type DbTable = SQLiteTable

// Drizzle withRelations
export type NestedRelations = {
  [key: string]: boolean | { columns: NestedRelations } | { with: NestedRelations }
}

/* ----------------- */
// PREVIEWS
/* -------- */

export type PreviewStage = 'local' | 'preview' | 'production'

export type MapRenderAssetKind = 'styles' | 'layers' | 'projects'

export type MapRenderStorageMode = 'r2'

export type MapRenderPersistenceTarget = 'local' | 'remote'

export type MapRenderRemoteConfig = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
}

export type MapRenderAssetLocator = {
  kind: MapRenderAssetKind
  identifier: string
  hash: string
  extension?: 'png'
}

export type MapRenderManifestEntry = {
  fileName: string
  publicPath: string
  objectKey: string
  publicUrl: string
  hash: string
  sourceUrl: string
}

export type MapRenderJob = {
  kind: MapRenderAssetKind
  identifier: string
  hash: string
  sourceUrl: string
  targetObjectKey: string
}

export type AssetRenderJob = {
  env: PreviewStage
  publicId: string
  version?: number
}

/* ----------------- */
// ASSET ANALYTICS
/* -------- */

export type AssetAnalyticsWindowKey = '1h' | '24h' | '7d' | '30d'

export type AssetAnalyticsPercentKey =
  | 'cacheHitPercent'
  | 'derivedHitPercent'
  | 'derivedMissPercent'
  | 'notFoundPercent'
  | 'serverErrorPercent'

export type AssetAnalyticsSeriesKey =
  | 'cache'
  | 'derivedHit'
  | 'derivedMiss'
  | 'notFound'
  | 'serverError'

export type AssetAnalyticsLatencyTier = 'p50Ms' | 'p95Ms' | 'p99Ms'

export type AssetAnalyticsLatencyBucket = {
  cache: number | null
  derivedHit: number | null
  derivedMiss: number | null
  notFound: number | null
  serverError: number | null
}

export type AssetAnalyticsRankedTransformation = {
  transformKey: string
  requests: number
}

export type AssetAnalyticsTimeseriesPoint = {
  date: string
  totalRequests: number
  cacheRequests: number
  derivedHitRequests: number
  derivedMissRequests: number
  notFoundRequests: number
  serverErrorRequests: number
}

export type AssetAnalyticsBreakdownItem = {
  key: string
  label: string
  requests: number
  percent: number
}

export type AssetAnalyticsBreakdowns = {
  cropModes: AssetAnalyticsBreakdownItem[]
  formats: AssetAnalyticsBreakdownItem[]
  dimensions: AssetAnalyticsBreakdownItem[]
  qualities: AssetAnalyticsBreakdownItem[]
  gravities: AssetAnalyticsBreakdownItem[]
}

export type AssetAnalyticsRankedImage = {
  publicId: string
  requests: number
}

export type AssetAnalyticsSummaryWindow = {
  totalRequests: number
  cacheHitPercent: number
  derivedHitPercent: number
  derivedMissPercent: number
  notFoundPercent: number
  serverErrorPercent: number
  p50Ms: AssetAnalyticsLatencyBucket
  p95Ms: AssetAnalyticsLatencyBucket
  p99Ms: AssetAnalyticsLatencyBucket
  timeseries30d: AssetAnalyticsTimeseriesPoint[]
  breakdowns: AssetAnalyticsBreakdowns
  topTransformations: AssetAnalyticsRankedTransformation[]
  topImages: AssetAnalyticsRankedImage[]
  topMissingImages: AssetAnalyticsRankedImage[]
  topServerErrorImages: AssetAnalyticsRankedImage[]
}

export type AssetAnalyticsWindowErrors = Partial<
  Record<AssetAnalyticsWindowKey, string>
>

export type AssetAnalyticsSummary = {
  environment: string
  generatedAt: string
  scope: {
    organisationIds: string[]
    projectIds: string[]
  }
  windows: Record<AssetAnalyticsWindowKey, AssetAnalyticsSummaryWindow | null>
  windowErrors: AssetAnalyticsWindowErrors
}

export type AssetAnalyticsSummaryResult =
  | {
      status: 'success'
      data: AssetAnalyticsSummary
    }
  | {
      status: 'empty'
      message: string
      data: AssetAnalyticsSummary | null
    }
  | {
      status: 'error'
      message: string
    }

/* ----------------- */
// PROJECT LICENSE
/* -------- */

export type ProjectLicenseMediaType = 'all' | 'image' | 'text' | 'data'

export type ProjectLicenseRights = {
  license: string
  isPublicDomain: boolean
  isAllRightsReserved: boolean
  BY: boolean | null
  SA: boolean | null
  NC: boolean | null
  ND: boolean | null
}

export type ProjectLicenseMedia = Record<ProjectLicenseMediaType, ProjectLicenseRights>

export type ProjectLicenseMeta = {
  allMediaSameRights: boolean
  attribution: string
  isAllRightsReserved: boolean
  isPublicDomain: boolean
  history: ProjectLicenseHistoryEntry[]
}

export type ProjectLicenseHistoryEntry = {
  publishedAt: string
  licenses: Partial<Record<ProjectLicenseMediaType, string>>
  attribution: string
}

export type ProjectLicense = {
  meta: ProjectLicenseMeta
  media: ProjectLicenseMedia
}

/* ----------------- */
// RESOURCES
/* -------- */

export type NavigableResource = Exclude<FirstClassResource, FirstClassResource.property>

export type ResourceConfig = {
  name: string
  table: SQLiteTableWithColumns<any>
  parentName: string | null
  parentTable: SQLiteTableWithColumns<any> | null
  keyToParent: string | null
  keyToSelf: string
  depth: number
}

export type ResourceHierarchy = ResourceConfig[]

export type ResourceContext = {
  feature?: Feature | FeatureFromCollection
  layer?: Layer
  project?: Project
  organisation?: Organisation
}

export type ResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task'
  | 'image'
  | 'user'
  | 'hub'
  | 'userFeature'

export type FalsableResourceType = ResourceType | false

export type HierarchicalResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task'

export type ResourceTypeWithParent = Exclude<HierarchicalResourceType, 'organisation'>

export type ResourceTypeWithChildren = Exclude<
  HierarchicalResourceType,
  'feature' | 'task'
>

/* ----------------- */
// NAVIGATION :: ADMIN :: ACTIVE RESOURCE
/* -------- */

export type SidebarState = 'closed' | 'narrow' | 'open'

/* ----------------- */
// ADMIN CONTROLS
/* -------- */
export type LayoutMode = 'table' | 'list' | 'card'
export type HeaderControlsMode = 'auto' | 'view' | 'form' | 'none'

export interface HeaderVisibilityOverrides {
  showNew?: boolean
  showFilter?: boolean
  showFacets?: boolean
  showViewActions?: boolean
  showFormActions?: boolean
  showAvatar?: boolean
  showLayoutToggle?: boolean
  showControlBarToggle?: boolean
}

export type HeaderFacetItem = {
  ref: string
  label: string
  icon: Component | null
  class?: string
  hasIssues?: boolean
  disabled?: boolean
}

export type HeaderMetaState = {
  title: string
  icon: Component | null
  crumbs: HeaderCrumb[]
  facets: HeaderFacetItem[]
  activeFacet: string | false | null
  onFacetChange: ((ref: string) => void) | null
  titleMenuItems: HeaderTitleMenuItemConfig[]
  viewActions: HeaderButtonActionConfig[]
  taskActions: HeaderButtonActionConfig[]
  taskActionContent: HeaderLayoutRegionConfig | null
}

export type HeaderFormActionsState = {
  dirty: boolean
  isSubmitting: boolean
  hasIssues: boolean
  isPublishing: boolean
  isDeleting: boolean
  isDeleted: boolean
  isPublished: boolean
  canEdit: boolean
  disableEdit: boolean
  canPublish: boolean
  showDeleteAction: boolean
  showPublishAction: boolean
  reset: () => void
  submit: () => void
  togglePublish: () => void | Promise<void>
  toggleDelete: () => void
}

export type HeaderCtrlState = {
  controlsMode: HeaderControlsMode
  isEditing: boolean
  visibility: HeaderVisibilityOverrides
  meta: HeaderMetaState
  formActions: HeaderFormActionsState | null
  layout: {
    controlBar: HeaderLayoutRegionConfig | null
    footer: HeaderLayoutRegionConfig | null
  }
}

/* ----------------- */
// VIEW FILTERS (TIER 3)
/* -------- */
export type FilterTriState = boolean | null
export type LocalisedFilterTriState = Record<LocaleKey, FilterTriState>

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

export type OrganisationViewFilters = {
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

export type ProjectViewFilters = {
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

export type LayerViewFilters = {
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

export type TaskViewFilters = {
  // Status related
  isReviewed: FilterTriState
  reviewOutcome: FilterTriState
  reviewAction: ReviewAction | null
  type: TaskType | null
}

export type HubViewFilters = {
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

/* ----------------- */
// PLACECTX
/* -------- */

export type PlaceState = {
  filters: {
    feature: {
      neighbourhood: {
        include: SvelteSet<Ref>
        exclude: SvelteSet<Ref>
      }
    }
  }
  contains: {
    feature: {
      // Mapping neighbourhood name to feature ids
      neighbourhood: SvelteMap<Ref, SvelteSet<Id>>
      // Mapping district name to feature ids
      // districts: Map<string, Id[]>;
    }
  }
  counts: {
    feature: {
      neighbourhood: SvelteMap<Ref, number>
    }
  }
}

// Organisation filter keys
export type OrganisationStatusFilterKey = 'isPublished' | 'isArchived'
export type OrganisationTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'
export type OrganisationAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'
export type OrganisationImageFilterKey = 'hasImage'

// Project filter keys
export type ProjectStatusFilterKey = 'isPublished' | 'isArchived'
export type ProjectTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'
export type ProjectAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'

export type ProjectImageFilterKey = 'hasImage'

// Layer filter keys (no image filters)
export type LayerStatusFilterKey = 'isPublished' | 'isArchived'
export type LayerTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'
export type LayerAuthorshipFilterKey =
  | 'hasName'
  | 'hasContextualName'
  | 'hasDescription'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'

export type FeatureStatusFilterKey =
  | 'isPublished'
  | 'isPendingReview'
  | 'isArchived'
  | 'isIntangible'
  | 'isVisitable'
export type FeatureTranslationFilterKey =
  | 'isTitleTranslated'
  | 'isDescriptionTranslated'
  | 'isAddressTranslated'
  | 'isSpecifierTranslated'
export type FeatureAuthorshipFilterKey =
  | 'hasTitle'
  | 'hasDescription'
  | 'hasDisplayAddress'
  | 'isAllRightsReserved'
  | 'isPublicDomain'
  | 'hasLicenseBy'
  | 'hasLicenseSa'
  | 'hasLicenseNc'
  | 'hasLicenseNd'
export type FeatureImageFilterKey =
  | 'hasImage'
  | 'isOneImagePublished'
  | 'isAllImagePublished'
// Task filter keys
export type TaskStatusFilterKey =
  | 'isReviewed'
  | 'reviewOutcome'
  | 'reviewAction'
  | 'type'

// Hub filter keys (only archived status)
export type HubStatusFilterKey = 'isArchived'
export type HubTranslationFilterKey =
  | 'isNameTranslated'
  | 'isContextualNameTranslated'
  | 'isDescriptionTranslated'
export type HubAuthorshipFilterKey = 'hasName' | 'hasContextualName' | 'hasDescription'
export type HubImageFilterKey = 'hasImage'

export type ViewFilterResource = keyof ViewFilters
export type PropertyFilterType = 'classifier' | 'specifier'
export type ResourceFilterToggleKey<T extends ViewFilterResource> = Extract<
  Exclude<keyof ViewFilters[T], 'translationLocales' | 'properties'>,
  string
>
export type ResourceTranslationFilterKey<T extends ViewFilterResource> = Extract<
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

export type ResourceToggleFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'toggle'
    key: ResourceFilterToggleKey<T>
  }

export type ResourceTranslationFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'translation'
    key: ResourceTranslationFilterKey<T>
  }

export type ResourceSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ResourceSelectFilterConfig<T extends ViewFilterResource> =
  ResourceFilterConfigBase & {
    type: 'select'
    key: ResourceFilterToggleKey<T>
    placeholder?: string
    allowDeselect?: boolean
    options: ResourceSelectOption[]
  }

export type ResourceFilterSectionConfig<T extends ViewFilterResource> = {
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

export type ResourceSortItemConfig = {
  value: string
  label: string
}

export type ResourceSortConfig = {
  items: ResourceSortItemConfig[]
}

/* ----------------- */
// FILTERS :: APP
/* -------- */

// Resources constrained by suncast filters
export type FilteredResources = {
  organisation: Organisation[]
  project: Project[]
  layer: Layer[]
  feature: FeatureFromCollection[]
  task: Task[]
  hub: Hub[]
}

export type ResourceFilterState = {
  text?: string
  properties?: Record<
    Id,
    string[] | RangeFilterValue | Record<Id, Record<Id, string[] | RangeFilterValue>>
  >
}

export type FilterState = {
  organisation: ResourceFilterState
  project: ResourceFilterState
  layer: ResourceFilterState
  feature: ResourceFilterState
  task: ResourceFilterState
  hub: ResourceFilterState
  property: ResourceFilterState
}
export type AdminFilterStates = Record<FirstClassResource, FilterState>
export type ResourceSortState = {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}
export type ViewSortingState = Record<FirstClassResource, ResourceSortState>

export type FeatureTextSearchIndexItem = {
  id: string
  title?: string | null
  description?: string | null
  displayAddress?: string | null
  contributor?: string | null
}

export type FeatureTextSearchWorkerRequest =
  | {
      type: 'set-index'
      indexVersion: number
      items: FeatureTextSearchIndexItem[]
    }
  | {
      type: 'filter'
      indexVersion: number
      requestId: number
      query: string
    }

export type FeatureTextSearchWorkerResponse = {
  type: 'result'
  indexVersion: number
  requestId: number
  ids: string[]
}

export type FeatureRowStatMap = Record<string, boolean | null>

export type FeatureRowModel = {
  id: string
  title: string
  description: string
  imageAlt: string
  isPublished: boolean
  isPendingReview: boolean
  stats: {
    status: FeatureRowStatMap
    content: FeatureRowStatMap
    translation: FeatureRowStatMap
    image: FeatureRowStatMap
    category: FeatureRowStatMap
    freeform: FeatureRowStatMap
  }
}

export type ActiveCollection = {
  id: string
  type: 'neighbourhood' | 'walk' | 'feature' | 'search'
  i18n: Record<Locale, { name: string }>
  items: (FeatureFromCollection | Feature)[]
} | null

/* ----------------- */
// ENTITY CARDS
/* -------- */

export type KeyMap = {
  id: 'id' | 'code' | string
  title: string
  subtitle?: string
  description?: string
  image: string
  tags?: string[]
  badges?: Array<{
    label: string
    variant?: 'primary' | 'secondary' | 'outline' | undefined
    type?: 'boolean'
    trueText?: string
    falseText?: string
    superAdminOnly?: boolean
  }>
}

export type EntityWithOptionalImage = Exclude<Resource, Task> & {
  image?: ImageContextEnvelope | ImageCtxEnvelope | string | null
}

/* ----------------- */
// STATS
/* -------- */

export type StatsCache = SvelteMap<
  FirstClassResource,
  SvelteMap<
    Id,
    SvelteMap<Key, { value: any; type: 'boolean' | 'count' | 'mean' | 'sum' }>
  >
>

// Define the shape of the cache
export type Cache = {
  organisation: Map<Id, Organisation>
  project: Map<Id, Project>
  layer: Map<Id, Layer>
  feature: Map<Id, FeatureFromCollection | Feature>
  property: Map<Id, Property>
  task: Map<Id, Task>
  hub: Map<Id, Hub>
  image: Map<Id, ImageDB>
  user: Map<Id, UserProfile>
  stats: StatsCache
}

/* ----------------- */
// URL
/* -------- */

export type QueryParams = Record<string, unknown>
export type PaginationParams = {
  limit?: number
  offset?: number
}
export type ListResponse<T> = {
  data: T[]
  limit?: number
  offset?: number
  totalCount: number
  hasMore?: boolean
  nextOffset?: number | null
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  appliedFilters?: QueryParams
  q?: string
  durationMs?: number
}
export type EntityResponse<T> = {
  data: T | null
  durationMs?: number
}
export type ListQueryParams<
  TConditions extends Record<string, unknown> = Record<string, unknown>,
> = {
  conditions?: Partial<TConditions>
  prisms?: Partial<Prisms>
  pagination?: PaginationParams
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  q?: string
}
/* ----------------- */
// NAVIGATION :: PRISMS
/* -------- */

export type Prisms = { organisation: Code[]; project: Code[]; layer: Id[] }

/* ----------------- */
// NAVIGATION :: FACETS
/* -------- */

export const Facets = [
  'core',
  'capabilities',
  'address',
  'images',
  'fields',
  'layers',
  'policies',
] as const
export type FacetType = (typeof Facets)[number]

/* ----------------- */
// HUB
/* -------- */

export type HubSubscriptionPlacement = {
  hubPanel: boolean
  topBar: boolean
  menu: boolean
}

export type HubUserStateFlags = {
  subscriptionPromptDismissed?: boolean
  subscriptionMember?: boolean
  hasAgreedToTerms?: boolean
}

/* ----------------- */
// I18N
/* -------- */

export type Locale = `${SupportedLocales}`
export type LocaleExtended = LocaleKey | 'core'

export type TranslatedValue = {
  value: string
  i18n?: {
    locale: string
    value: string
  }[]
}

// Define the shape of a translation object
export interface LocaleBundle {
  locale: Locale
  [key: string]: unknown
}

export type CapabilityI18nRoot = {
  en?: string
  zhHans?: string
  zhHant?: string
}

export type CapabilityKey = 'manageBakeries' | 'manageVolunteers' | 'manageDropOffs'

export type CapabilityDefinition = {
  i18n?: CapabilityI18nRoot
}

export type CapabilityDefinitions = Partial<Record<CapabilityKey, CapabilityDefinition>>

/* ----------------- */
// HTML
/* -------- */

export type InputType = 'text' | 'number' | 'email' | 'password'

/* ----------------- */
// SESSION
/* -------- */

export type Session = BetterAuthSessionSession
export type SessionUser = BetterAuthSessionUser

/* ----------------- */
// I18N
/* -------- */

export interface TranslationState {
  confirmed: boolean
  translated: boolean
  required: boolean
}

export type TranslationStates = Record<Locale, TranslationState>

/* ----------------- */
// FORMS
/* -------- */

export type SuperFormResult<T extends Record<string, unknown>> = {
  form: Writable<T>
  enhance: typeof enhance
  constraints: Writable<InputConstraints<T>>
  validate: (
    path: FormPathLeaves<T>,
    // opts?: ValidateOptions<FormPathType<T, FormPathLeaves<T>>, T, Record<string, unknown>>
    opts?: ValidateOptions<
      FormPathType<T, FormPathLeaves<T>>,
      T,
      Record<string, unknown>
    >,
  ) => Promise<string[] | undefined>
  // validateForm!: () => Promise<SuperValidated<Record<string, unknown>, string, Form>>;
  validateForm: () => Promise<SuperValidated<T>>
  tainted: Writable<TaintedFields<T> | undefined>
  // isTainted!: (path?: FormPath<T> | Record<string, unknown> | boolean | undefined) => boolean;
  isTainted: (path?: FormPath<T> | boolean | undefined) => boolean
  submit: (event: Event) => void
  reset: (options?: {
    keepMessage?: boolean
    data?: Partial<T>
    newState?: Partial<T>
    id?: string
  }) => void
  errors: Writable<ValidationErrors<T>>
  message: Writable<string | undefined>
  posted: Writable<boolean>
}

export type LayerForm = LayerFormType
export type OrganisationForm = OrganisationFormType
export type ProjectForm = ProjectFormType
export type FeatureForm = FeatureFormType
export type HubForm = HubFormType
export type Form = LayerForm | OrganisationForm | ProjectForm | FeatureForm | HubForm

export type FormSubmissionResultHandlerParams = {
  success: boolean
  issues?: RemoteFormIssue[]
  error?: string
  onSuccess: () => void | Promise<void>
  onError: (error: string) => void | Promise<void>
  onInvalid: (issues: RemoteFormIssue[]) => void | Promise<void>
  onFallback: () => void | Promise<void>
}

export type SubmitOutcome = {
  success: boolean
  result?: unknown
  issues?: RemoteFormIssue[]
  error?: string
}

export type FormHeaderController = {
  setEditing: (isEditing: boolean) => void
}

export type HeaderFormActionsController = {
  setFormActions: (formActions: Partial<HeaderFormActionsState>) => void
}

export type HeaderTaskActionsController = {
  setTaskActions: (actions: HeaderButtonActionConfig[]) => void
  setTaskActionContent: (
    component: HeaderLayoutRegionConfig['component'],
    props?: HeaderLayoutRegionConfig['props'],
  ) => void
}

export type ResourceEditorHeaderController = FormHeaderController &
  HeaderFormActionsController & {
    setHeaderForEntity: (...args: any[]) => void
    clearFormActions: () => void
  }

export type HeaderFormActionHandlers = Pick<
  HeaderFormActionsState,
  'reset' | 'submit' | 'togglePublish' | 'toggleDelete'
>

export type HeaderFormActionStatus = Pick<
  HeaderFormActionsState,
  | 'dirty'
  | 'isSubmitting'
  | 'hasIssues'
  | 'isPublished'
  | 'isDeleted'
  | 'canEdit'
  | 'disableEdit'
  | 'canPublish'
  | 'showDeleteAction'
  | 'showPublishAction'
>

export type HeaderTransitionSnapshot = Pick<
  HeaderFormActionsState,
  | 'canEdit'
  | 'canPublish'
  | 'showDeleteAction'
  | 'showPublishAction'
  | 'isPublished'
  | 'isDeleted'
> & {
  facets: HeaderFacetItem[]
}

export type OrganisationToggleField = 'isPublished' | 'isArchived'

export type WireHeaderFormActionHandlersParams = {
  headerCtrl: HeaderFormActionsController
  handlers: HeaderFormActionHandlers
}

export type SyncHeaderFormActionStatusParams = {
  headerCtrl: HeaderFormActionsController
  status: HeaderFormActionStatus
  lastSignature: string
}

export type ResolveOptimisticHeaderStatusParams = {
  isSettled: boolean
  isImageFacetActive?: boolean
  isNewRef?: boolean
  dirty: boolean
  isSubmitting: boolean
  hasIssues: boolean
  isPublished: boolean
  isDeleted: boolean
  canEdit: boolean
  canPublish: boolean
  showDeleteAction: boolean
  showPublishAction: boolean
  snapshot: HeaderTransitionSnapshot
}

export type ResourceFormSubmissionResultParams = {
  success: boolean
  issues?: RemoteFormIssue[]
  error?: string
  nameKey: string
  onSuccess?: () => void | Promise<void>
  refreshResource: () => Promise<void>
  locale?: Locale
  formLocaleKey?: string
  formLocaleValues?: Record<string, unknown>
  resourceLocaleValues?: Record<string, unknown>
  submittedValues?: Record<string, unknown>
  invalidMessage?: string
  fallbackErrorMessage?: string
  successPrefix?: string
}

export type CollectionNavOptions = {
  openCard?: boolean
  openCardDelay?: number
  isCardOpen?: boolean
  focus?: boolean
  focusFeature?: boolean
  highlight?: boolean
  navOptions?: Record<string, string>
}

export type ConfigureFormResourceResultOptions<Input> = {
  nameKey?: string
  nameFallbackKey?: string
  onSuccess?: () => void | Promise<void>
  getEntity?: () => { data?: Record<string, unknown> | null } | null | undefined
  refreshResource: (ctx: {
    data: Input
    success: boolean
    issues?: RemoteFormIssue[]
    error?: string
    result?: unknown
    shouldRedirect: boolean
  }) => Promise<void>
  shouldRedirect?: (ctx: {
    data: Input
    success: boolean
    issues?: RemoteFormIssue[]
    error?: string
    result?: unknown
  }) => boolean
  onRedirect?: (ctx: { data: Input; success: boolean }) => void | Promise<void>
}

export type FormIssueLike = {
  message: string
  path?: Array<string | number>
}

export type UserRoleFieldNameResolverForm = {
  fields: {
    value: () => {
      data?: {
        userRoles?: Array<{ userId: string }>
      }
    }
    data?: {
      userRoles?: Array<{
        role?: { as: (type: 'select') => { name?: string } }
        userId?: { as: (type: 'hidden', value: string) => Record<string, unknown> }
        capabilities?: Partial<
          Record<
            CapabilityKey,
            { as: (type: 'hidden', value: string) => Record<string, unknown> }
          >
        >
      }>
    }
  }
}

export type UserRoleHiddenInputAttrs = Record<string, unknown>

export type HubOrganisationFieldNameResolverForm = {
  fields: {
    value: () => {
      data?: {
        organisations?: Array<{
          organisationId: string
          isCoreInclusive: boolean
          isHubExclusive: boolean
        }>
      }
    }
    data?: {
      organisations?: Array<{
        organisationId?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        isCoreInclusive?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        isHubExclusive?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
      }>
    }
  }
}

export type HubOrganisationHiddenInputAttrs = Record<string, unknown>

export type HubLayerDefaultFieldNameResolverForm = {
  fields: {
    data?: {
      layerDefaults?: Array<{
        hubId?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        layerId?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        isDefaultVisible?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
      }>
    }
  }
}

export type HubLayerDefaultHiddenInputAttrs = Record<string, unknown>

export type GenAiField =
  | 'title'
  | 'name'
  | 'nameShort'
  | 'description'
  | 'subscriptionBenefits'
  | 'privacyPolicy'
  | 'termsOfService'
export type I18nTranslatableField =
  | 'name'
  | 'nameShort'
  | 'description'
  | 'subscriptionBenefits'
  | 'privacyPolicy'
  | 'termsOfService'
export type FormBooleanValue = boolean | 'true' | 'false'

export type GenAiStateResolverForm = {
  fields: {
    value: () => {
      data?: {
        i18n?: Record<
          string,
          {
            titleGen?: FormBooleanValue
            nameGen?: FormBooleanValue
            nameShortGen?: FormBooleanValue
            descriptionGen?: FormBooleanValue
            subscriptionBenefitsGen?: FormBooleanValue
            privacyPolicyGen?: FormBooleanValue
            termsOfServiceGen?: FormBooleanValue
          }
        >
      }
    }
  }
}

export type FormDataUpdaterForm<T> = {
  fields: {
    value: () => {
      data?: T
    }
    set: (value: any) => void
  }
}

export type FormTrimmedTextControlBlurParams = {
  event: FocusEvent
  value: string
  setValue: (value: string) => void
  onValueChange?: (value: string) => void
  afterSync?: () => void
}

export type AddUserRoleSelectionParams<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
> = {
  form: FormDataUpdaterForm<TFormData>
  entity: TEntity
  user: {
    id: string
    name?: string | null
    image?: unknown
    attribution?: string | null
  }
  defaultRole: string
  foreignKey: string
}

export type RemoveUserRoleSelectionParams<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
> = {
  form: FormDataUpdaterForm<TFormData>
  entity: TEntity
  userId: string
}

export type UpdateUserRoleSelectionParams<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
> = {
  form: FormDataUpdaterForm<TFormData>
  entity: TEntity
  userId: string
  role: string
}

export type ResolveDisplayUserRolesParams<
  TUserRole extends { userId: string; role: string },
> = {
  baseRoles: TUserRole[]
  formUserRoles: Array<{ userId: string; role: string }>
}

export type TranslateLocaleIntoEmptyFieldsParams<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
      }
    >
  },
> = {
  form: FormDataUpdaterForm<TFormData>
  sourceLocale: Locale
  targetLocale: Locale
  fields?: I18nTranslatableField[]
}

export type ResetLocaleFieldsParams<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
      }
    >
  },
> = {
  form: FormDataUpdaterForm<TFormData>
  targetLocale: Locale
  fields?: I18nTranslatableField[]
}

/* ----------------- */
// FORM FIELDS
/* -------- */

export type FormFieldDefinition = {
  label?: string
  placeholder?: string
  component?: FieldComponentType
  isArray: boolean
  isNested: boolean
  isTranslated: boolean
}
export type FormFieldExtendedDefinition = FormFieldDefinition & {
  values?: readonly string[]
  inputType?: InputType
  showForComponent?: FieldComponentType[]
}
export type FormFieldNestedDefinition = FormFieldDefinition & {
  coreValues: string[]
  translatedValues: string[]
}

export type FormFieldArrayDefinition = {
  isArray: true
  discriminators: {
    key: string
    values: readonly string[]
    specs: Record<
      Exclude<FieldDiscriminatorEnum, 'display'>,
      Record<Key, FormFieldExtendedDefinition>
    >
  }
}
export type FormField = Record<Field, FormFieldDefinition>
export type FormFieldArray = Record<Field, FormFieldArrayDefinition>
export type FormFieldNested = Record<Field, FormFieldNestedDefinition>
export type FormFieldConfig = Record<Key, FormField | FormFieldArray | FormFieldNested>

/* ----------------- */
// RESOURCE :: COMMON
/* -------- */

// (Nano) unique identifier
export type Id = string
// Human-readable unique identifier
export type Code = string
// How the object is publicly addressed
export type Ref = Id | Code
// Property name in API or Database
export type Key = string
// Drizzle relation selection shape used by service query helpers.
export type RelationShape = Record<string, boolean | object>

/* ----------------- */
// SCHEMA TYPES
/* -------- */

export type OrganisationField = keyof Organisation | keyof OrganisationI18nDB
export type ProjectField = keyof Project | keyof ProjectI18nDB
export type LayerField = keyof Layer | keyof LayerI18nDB
export type FeatureField = keyof Feature | keyof FeatureI18nDB
export type HubField = keyof Hub
export type Field =
  | OrganisationField
  | ProjectField
  | LayerField
  | FeatureField
  | HubField
export type Resource =
  | Organisation
  | Project
  | Layer
  | Feature
  | FeatureFromCollection
  | Task
  | Hub
  | Property
export type ResourceNew =
  | OrganisationNew
  | ProjectNew
  | LayerNew
  | FeatureNew
  | TaskNew
  | HubNew
export type ResourceDB =
  | OrganisationDB
  | ProjectDB
  | LayerDB
  | FeatureDB
  | TaskDB
  | HubDB

// RELATED TYPES
export type FormI18n<T> = Record<Locale, T>

/* ----------------- */
// USERS :: JOIN
/* -------- */

// Used to distriminate between Organisation and Project roles
export type UserJoinConfig = {
  discriminator: 'role'
  checkedValue: 'owner' | 'maintainer'
  uncheckedValue: 'member'
}

// Used to manage organisation core inclusion in hubs
export type OrganisationJoinConfig = {
  discriminator: 'isCoreInclusive'
  checkedValue: true
  uncheckedValue: false
}

/* ----------------- */
// USERS :: JSON TYPE OBJECTS
/* -------- */

// JSON type objects for user preferences and experimental features

export type I18nFormInputShape = {
  data: {
    i18n: Record<string, unknown>
  }
}
export type FormLocaleKey<TForm extends I18nFormInputShape> =
  keyof TForm['data']['i18n']
export type LocaleKey = 'en' | 'zhHans' | 'zhHant'
export type FormLocaleInput<TForm extends I18nFormInputShape> =
  TForm['data']['i18n'][FormLocaleKey<TForm>]
export type FormLocaleSource<TForm extends I18nFormInputShape> =
  | Partial<FormLocaleInput<TForm>>
  | null
  | undefined

export type QueryWithOverride<TCurrent = unknown, TResult = unknown> = {
  withOverride(update: (current: TCurrent) => TCurrent): TResult
}

export type ResourceSubmitMode = 'create' | 'replace' | 'update'
export type ResourceSubmitMetaDraft = {
  id?: unknown
  mode?: unknown
  licenseTouched?: unknown
}
export type ResourceSubmitDraft<TData extends Record<string, unknown>> = {
  meta?: ResourceSubmitMetaDraft
  data?: TData
}
export type ChangedRelationResolution<TEffective> = {
  effective: TEffective
  changed: boolean
}
export type ResolveChangedRelationParams<TEffective> = {
  submittedValue: unknown
  currentValue: unknown
  baselineValue: unknown
  toEffective: (params: {
    submittedValue: unknown
    currentValue: unknown
  }) => TEffective
  toComparableEffective: (value: TEffective) => unknown
  toComparableBaseline: (value: unknown) => unknown
  toSignature: (value: unknown) => string
}
export type ApplyChangedRelationFieldParams<
  TData extends Record<string, unknown>,
  TKey extends keyof TData,
  TEffective,
> = {
  data: TData
  key: TKey
} & ResolveChangedRelationParams<TEffective>
export type FieldDiscriminator = `${FieldDiscriminatorEnum}`

export const fieldComponentTypes = [
  'InputField',
  'SelectField',
  'RangeField',
  'TextareaField',
  'UsersField',
  'CustomField',
  'ListField',
  'ToggleField',
  'DisplayField',
] as const
export const classifierComponentTypes = ['SelectField', 'RangeField'] as const
export const specifierComponentTypes = ['InputField', 'TextareaField'] as const
export const displayComponentTypes = ['InputField'] as const
export type FieldComponentType = (typeof fieldComponentTypes)[number]
export type FieldComponent = FieldComponentCtor

export type RangeFilterValue = {
  globalMin: number
  globalMax: number
  rangeMin: number
  rangeMax: number
}

export type IntermediateValue = {
  id: string
  rank: number
  en: string
  enGen: boolean
  zhHans: string
  zhHansGen: boolean
  zhHant: string
  zhHantGen: boolean
}

export type UserRole = HubRole | OrganisationRole | ProjectRole
export type UserRoleDisco =
  | (HubRole & { type: 'hub' })
  | (OrganisationRole & { type: 'organisation' })
  | (ProjectRole & { type: 'project' })

/* ----------------- */
// AUTHORIZATION
/* -------- */

export const authorizationResourceTypes = [
  'organisation',
  'project',
  'layer',
  'feature',
  'task',
  'hub',
  'property',
  'user',
] as const
export type AuthorizationResourceType = (typeof authorizationResourceTypes)[number]

export const organisationAuthorizationActions = [
  'readOrganisation',
  'listOrganisations',
  'createOrganisation',
  'updateOrganisation',
  'publishOrganisation',
  'manageOrganisationRoles',
  'deleteOrganisation',
] as const
export type OrganisationAuthorizationAction =
  (typeof organisationAuthorizationActions)[number]

export const projectAuthorizationActions = [
  'listProjects',
  'readProject',
  'createProject',
  'updateProject',
  'manageProjectRoles',
  'manageCapabilities',
  'assignCapabilities',
  'publishProject',
  'deleteProject',
] as const
export type ProjectAuthorizationAction = (typeof projectAuthorizationActions)[number]

export const hubAuthorizationActions = [
  'listHubs',
  'readHub',
  'createHub',
  'updateHub',
  'manageHubRoles',
  'publishHub',
  'deleteHub',
] as const
export type HubAuthorizationAction = (typeof hubAuthorizationActions)[number]

export type AuthorizationAction =
  | OrganisationAuthorizationAction
  | ProjectAuthorizationAction
  | HubAuthorizationAction

export const organisationAuthorizationFields = [
  'code',
  'url',
  'i18n',
  'userRoles',
  'properties',
  'hubId',
  'isCoreInclusive',
  'isHubExclusive',
  'isPublished',
] as const
export type OrganisationAuthorizationField =
  (typeof organisationAuthorizationFields)[number]

export const projectAuthorizationFields = [
  'organisationId',
  'code',
  'i18n',
  'license',
  'capabilities',
  'userRoles',
  'projectRoleCapabilities',
  'properties',
  'isPublished',
  'isArchived',
] as const
export type ProjectAuthorizationField = (typeof projectAuthorizationFields)[number]

export const hubAuthorizationFields = [
  'code',
  'domain',
  'i18n',
  'userRoles',
  'organisations',
  'isPublished',
  'isArchived',
] as const
export type HubAuthorizationField = (typeof hubAuthorizationFields)[number]

export type AuthorizationField =
  | OrganisationAuthorizationField
  | ProjectAuthorizationField
  | HubAuthorizationField

export const authorizationDenyCodes = [
  'UNAUTHENTICATED',
  'REQUEST_STATE_REQUIRED',
  'INSUFFICIENT_ROLE',
  'HUB_SCOPE_FORBIDDEN',
  'FIELD_FORBIDDEN',
  'NOT_IMPLEMENTED',
] as const
export type AuthorizationDenyCode = (typeof authorizationDenyCodes)[number]

export type AuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
  resourceType: AuthorizationResourceType
  action: AuthorizationAction
  resourceId?: string
  organisationId?: string | null
  resourceHubId?: string | null
  fields?: AuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type OrganisationAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  action: OrganisationAuthorizationAction
  resourceId?: string
  resourceHubId?: string | null
  fields?: OrganisationAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type ProjectAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
  action: ProjectAuthorizationAction
  resourceId?: string
  organisationId?: string | null
  resourceHubId?: string | null
  fields?: ProjectAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type HubAuthorizeParams = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  action: HubAuthorizationAction
  resourceId?: string
  resourceHubId?: string | null
  resourceHubCode?: string | null
  fields?: HubAuthorizationField[]
  requestedState?: {
    isPublished?: boolean
    isArchived?: boolean
  }
}

export type AuthorizationDecision = {
  allowed: boolean
  code?: AuthorizationDenyCode
}

export type OrganisationActionPermissions = {
  canCreate: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
}

export type LayerMetadata = {}

/* ----------------- */
// FEATURES
/* -------- */

/* ----------------- */
// FEATURES :: DB
/* -------- */

/* ----------------- */
// FEATURES : ADDRESS
/* -------- */

export type AddressProperties = {
  // Suggested Display Address
  formattedAddress?: string
  // Source Address
  rawAddress?: string

  // ADDRESS COMPONENTS (sorted roughly from smallest to largest unit)

  // Division - e.g. front, roof, etc.
  unitPortion?: string
  // Internal Building Numbering - e.g. 4, 13C,
  unitNumber?: string
  // Internal Building Numbering Type - e.g. floor, unit, room, etc.
  unitType?: string
  // Floor Numbering - e.g. 1/F, 13/F store 1 and 13.
  floorNumber?: string
  // Floor Type - e.g. concourse, upper g/f, roof, etc.
  floorType?: string

  buildingName?: string
  buildingNumberFrom?: string
  buildingNumberTo?: string

  // Block Type - e.g. tower, block, etc.
  blockType?: string
  // Block Number - e.g. 1, F etc.
  blockNumber?: string
  // Block Type Before Number - e.g. Tower 1 of F Block
  blockTypeBeforeNumber?: boolean

  phaseName?: string
  phaseNumber?: string
  premisesName?: string

  streetName?: string
  streetAddress?: string
  intersection?: string

  // Outside of Settlements
  lotType?: string
  lotNumber?: string

  // Settlements
  hamlet?: string
  village?: string
  town?: string

  // City Divisions
  microhood?: string
  neighbourhood?: string
  macrohood?: string

  // Administrative Divisions
  district?: string | null
  area?: string | null
  country?: string | null
}

export type AddressMeta = {
  // IDENTIFIERS

  // IDENTIFIERS :: HKGOV
  // // Building Deparment CSUID
  geoAddressCode?: string

  // IDENTIFIERS :: GOOGLE
  // // Google Place ID
  googlePlaceId?: string
  // // Plus Code
  plusCode?: string

  // GEOSPATIAL
  longitude?: number
  latitude?: number

  // METRICS
  distanceFromPoint?: number
  confidenceForwardGeocoder?: number

  // GEOCODING
  addressForwardGeocoder?: 'hkgov_als' | 'googlemaps' | 'invalid'
  addressReverseGeocoder?: 'hkgov_reverse' | 'googlemaps'
  addressReverseGen?: boolean
  addressForwardGen?: boolean
}

export type AddressPropertiesExtended = AddressProperties & AddressMeta

/* ----------------- */
// FEATURES : USER CONTRIBUTED
/* -------- */

// Base task creation data
type BaseTaskData = {
  layerId: Id
  organisationId: Id
  projectId: Id
  contributorId: Id
}

export type NewFeatureTask = BaseTaskData & {
  type: 'newFeature'
  feature: UserContributedFeature
  taskId?: Id
  featureId?: Id
}

// Specific task types
export type ReportedMissingTask = BaseTaskData & {
  type: 'reportedMissing'
  featureId: Id
  message?: string
}

export type NewPhotoTask = BaseTaskData & {
  type: 'newPhoto'
  featureId: Id
}

// Union type for all task creation APIs
export type TaskCreation = NewFeatureTask | ReportedMissingTask | NewPhotoTask

/* ----------------- */
// PROPERTIES
/* -------- */

export type ParamsToSign = {
  folder: string
  public_id?: string | null
  media_metadata?: 'true'
}

export type DeleteParamsToSign = {
  public_id: string | null
}

export type CameraPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied'

/* ----------------- */
// TASKS
/* -------- */

export const taskTypes = Object.values(TaskTypeEnum)
export type TaskType = `${TaskTypeEnum}`

export const reviewActions = [
  'ignored',
  'set-unpublished',
  'set-intangible',
  'set-archived',
  'added-all-photos',
  'added-all-photos-with-intent',
  'added-feature',
] as const
export type ReviewAction = (typeof reviewActions)[number]

export const reportedMissingActions = [
  'ignored',
  'set-archived',
  'set-unpublished',
  'set-intangible',
] as const
export type ReportedMissingAction = (typeof reportedMissingActions)[number]

export const newPhotoActions = [
  'ignored',
  'added-all-photos',
  'added-all-photos-with-intent',
] as const
export type NewPhotoAction = (typeof newPhotoActions)[number]

export const newFeatureActions = ['ignored', 'added-feature'] as const
export type NewFeatureAction = (typeof newFeatureActions)[number]

export const reviewOutcomes = Object.values(TaskReviewOutcome)
export type ReviewOutcome = `${TaskReviewOutcome}`

/* ----------------- */
// TASKS :: DB
/* -------- */

export type {
  Task,
  TaskCollection,
  TaskDB,
  TaskDBNew,
  TaskDBPartial,
  TaskDBRaw,
  TaskNew,
  TaskPartial,
} from './db/zod/schema/task.types'

/* ----------------- */
// SVELTE : PROPS
/* -------- */

export type FormProps = OrganisationForm | ProjectForm | LayerForm | FeatureForm

export type PageProps<T extends Resource> = {
  data: {
    [key: string]: T
  }
}

export type FormPageProps<T extends Resource> = {
  data: {
    validatedForm: SuperValidated<T>
    entity: Ref
    image?: Image | null
    images?: Image[] | null
  }
}

export type SectionProps = {
  form: Form
  fields: FormField | FormFieldArray
  fieldDiscriminator?: FieldDiscriminator
  title?: string
  subtitle?: string
  cols?: number
}

export type ExtendedParams = {
  locale?: LocaleExtended
  field: FormFieldExtendedDefinition
  fieldRoot: Field
  fieldIndex: number
  fieldKey: Field | 'value'
}

// FIELDS

export type FieldProps = SectionProps &
  ExtendedParams & {
    values?: string[]
    actions?: Record<string, (...args: any[]) => void>
  }

export type UserFieldProps = SectionProps & {
  fieldRoot: Field
  joinConfig: {
    discriminator: string // e.g. 'role'
    uncheckedValue: string // e.g. 'member'
    checkedValue: string // e.g. 'owner'
  }
  searchMode: boolean
  removeMode: boolean
}

export type FieldPropsExtended = FieldProps & ExtendedParams

export type ListFieldProps = FieldPropsExtended & {
  values: IntermediateValue[]
  actions: {
    add: (e: Event) => void
    remove: (e: Event, valueId: Id) => void
    update: (e: Event, valueId: Id, locale: Locale) => void
    syncUp: () => void
  }
  actionProps: {
    dragMode: boolean
    removeMode: boolean
    removeModeLocale?: string
    confirmingId?: string
  }
}

// PROVIDERS

export type ImageProviderProps = {
  children: any
  model: ImageProviderModel
}

export type NormalizedImageUploadAsset = {
  file: File
  originalFilename: string
  originalExtension: string | null
  originalWidth: number | null
  originalHeight: number | null
  uploadedWidth: number | null
  uploadedHeight: number | null
  wasResized: boolean
}

export interface ImageContextConfig {
  ctxType?: ImageContextResource
  ctxId?: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  ctxTypeSecondary?: ImageContextResourceExtended
  ctxIdSecondary?: Id
}

export interface ImageCtxConstructorOptions {
  isAdminMode?: boolean
  isValid?: boolean
  context?: ImageContextConfig | null
  image?: ImageCtxEnvelope | null
  images?: ImageCtxEnvelope[] | null
  highlightedIds?: Id[]
  isFullScreen?: boolean
}

export interface ImageProviderSyncTarget {
  state: {
    activeImage: ImageCtxEnvelope | null
    images: Map<Id, ImageCtxEnvelope>
  }
  setContext: (options: {
    context?: ImageContextConfig | null
    image?: ImageCtxEnvelope | null | undefined
    images?: ImageCtxEnvelope[] | null
    highlightedIds?: Id[]
    clearActiveImageOnContextChange?: boolean
  }) => Promise<void>
  refreshImages: (targetImageId?: string) => Promise<void>
  target: (imageId: Id) => ImageCtxEnvelope | undefined
  setTargetImageId: (imageId: Id | null) => void
  setMode: (mode: 'fullscreen' | 'normal') => void
}

export interface ImageProviderModel {
  getInitialOptions: () => ImageCtxConstructorOptions
  sync: (imageCtx: ImageProviderSyncTarget) => void
}

// ELEMENTS

export type InputProps = {
  id: Id
  value: string
  isGenAI: boolean
  placeholder?: string
  locale: LocaleExtended
  isTranslated?: boolean
  inputType?: 'text' | 'number' | 'email'
  onchange: Function
}

export type SelectProps = {
  id: Id
  value: string
  values: readonly string[] | { readonly value: string; readonly id: string }[]
  isComplex?: boolean
}

export type DisplayFieldProps = {
  label: string
  value: any
  justify?: 'start' | 'end'
  gridCell?: boolean
}

/* ----------------- */
// PANELS :: APP
/* -------- */

export type TitleEnvironmentLabel = 'ᴰᴱⱽ' | 'ᴾᴿᴱⱽᴵᴱᵂ' | 'ᴾᴿᴼᴰ'

export type PanelProps = {
  panelType: Panel
  position: PanelPosition
  scrollable: boolean
  inline: boolean
  isNarrow: boolean
  isAdmin: boolean
  active?: {
    resourceType: FirstClassResource | false
    resourceRef: Id | Code | false
    resourceId: Id | null
    facet: FacetType | false
  }
  adminCtx?: AdminCtx
}

export type PanelPosition = 'left' | 'right'

export type FeatureCardPortalObstacle = {
  top: number
  left: number
  right: number
  bottom: number
  diameter: number
  radius: number
  centerX: number
  centerY: number
}

export type FeatureCardTransitionRect = {
  left: number
  top: number
  width: number
  height: number
}

export type FeatureCardTransitionSourceKind = 'marker' | 'toggle' | 'none'

export type FeatureCardTransitionPhase = 'idle' | 'opening' | 'closing'

export type FeatureCardTransitionState = {
  phase: FeatureCardTransitionPhase
  sourceRect: FeatureCardTransitionRect | null
  targetRect: FeatureCardTransitionRect | null
  sourceRadiusPx: number
  targetRadiusPx: number
  sourceKind: FeatureCardTransitionSourceKind
}

export type PlanScheduleStop = {
  time: string
  featureId: Id
  title: string
  author: string
  addressLine: string
  country: string | null
  flag: string
  imageUrl: string | null
  latitude: number | null
  longitude: number | null
  distanceFromPreviousKm: number | null
  distanceLabel: string
}

export type PassportStamp = {
  featureId: Id
  title: string
  addressLine: string
  country: string | null
  flagCode: string | null
  imageUrl: string | null
}

export type EventCompanionPlatform = 'instagram' | 'linkedin' | 'facebook' | 'web'

export type EventCompanionRole = 'host' | 'author' | 'performer'

export type EventCompanionFollowLink = {
  label: string
  href: string
  platform: EventCompanionPlatform
}

export type EventCompanionSession = {
  featureId: Id
  title: string
  addressLine: string
  imageUrl: string | null
  buyHref: string
  follows: Record<EventCompanionRole, EventCompanionFollowLink | null>
}

// Define a type for the function argument to avoid self-reference
export interface SelectedResourcesProps {
  appCtx: any
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Resource[] | Neighbourhood[]
  selectedIds: Id[] | string[]
  colorClass?: string
}

/* ----------------- */
// APP :: OMNIBAR
/* -------- */

export type OmniState = {
  // Mode -- search, navigation, or feature
  mode: OmniMode
  // Whether the results are shown
  isTrayOpen: boolean
  // Whether the card is open
  isCardOpen: boolean
  // The value of the search input
  searchTerm: string
  // The index of the focused result
  focusedIndex: number
}

export type SearchResult = {
  name: string
  count: number
  collectionType: OmniCollection
  ref: string
}

export type OmniCollectionDescriptor = {
  kind: 'neighbourhood' | 'walk' | (string & {})
  ref: string
}

/* ----------------- */
// CTX STATE :: APP
/* -------- */

export type AppContextState = {
  markers: Map<Id, Marker>
  active: {
    feature: FeatureFromCollection | Feature | null
    collection: ActiveCollection | null
  }
  filters: FilterState
  prisms: Prisms
  resources: FilteredResources
  userFeatures: {
    wishlisted: UserFeature[]
    visited: UserFeature[]
  }
  userLocation: {
    coords: {
      accuracy: number
      altitude: number | null
      altitudeAccuracy: number | null
      heading: number | null
      latitude: number
      longitude: number
      speed: number | null
    }
    timestamp: number
  } | null
  distancesFromUser: Record<Id, number>
  nav: {
    resourceType: NavigableResource | false
    resourceRef: Id | false
    facet: FacetType | false
  }
  panels: {
    [key in Panel]: {
      isOpen: boolean
      isOpenVisually?: boolean
      ctx?: {
        username?: string | null
        userData?: UserProfile | null
        observePrisms?: boolean
      }
    }
  }
  // Header state for unified header system
  header: {
    icon: any | null
    title: string
    facetTabs: Map<FacetType, string>
    actions: {
      showAddButton: boolean
      showSearch: boolean
      showLayoutModes: boolean
      showControlBarToggle: boolean
      showFormActions: boolean
    }
  }
  // UI state for each resource type
  ui: {
    isControlBarVisible: Record<NavigableResource, boolean>
    layoutMode: Record<NavigableResource, LayoutMode>
    isSearchFocused: Record<NavigableResource, boolean>
  }
  // TIER 3: VIEW FILTERS - Only affect current route/view
  viewFilters: ViewFilters
  viewSorting: ViewSortingState
}

export type RemoteListFn<Params, Result> = (
  params: Params,
) => Promise<ListResponse<Result>>
export type RemoteGetFn<Params, Result> = (
  params: Params,
) => Promise<EntityResponse<Result>>

type OrganisationRemoteListFn = <P extends OrganisationProfile = OrganisationProfile>(
  params: OrganisationListParamsByProfile<P>,
) => Promise<ListResponse<OrganisationListByProfile<P>>>

type OrganisationRemoteGetFn = <P extends OrganisationProfile = OrganisationProfile>(
  params: OrganisationGetParamsByProfile<P>,
) => Promise<EntityResponse<OrganisationEntityByProfile<P>>>

type HubRemoteListFn = <P extends HubProfile = HubProfile>(
  params: HubListParamsByProfile<P>,
) => Promise<ListResponse<HubListByProfile<P>>>

type HubRemoteGetFn = <P extends HubProfile = HubProfile>(
  params: HubGetParamsByProfile<P>,
) => Promise<EntityResponse<HubEntityByProfile<P>>>

type LayerRemoteListFn = <P extends LayerProfile = LayerProfile>(
  params: LayerListParamsByProfile<P>,
) => Promise<ListResponse<LayerListByProfile<P>>>

type LayerRemoteGetFn = <P extends LayerProfile = LayerProfile>(
  params: LayerGetParamsByProfile<P>,
) => Promise<EntityResponse<LayerEntityByProfile<P>>>

export type RemoteMapEntry<
  ListParams = unknown,
  ListResult = unknown,
  GetParams = unknown,
  GetResult = unknown,
> = {
  list?: RemoteListFn<ListParams, ListResult>
  get?: RemoteGetFn<GetParams, GetResult>
}

type RemoteMapEntryByResource = {
  [FirstClassResource.organisation]: {
    list?: OrganisationRemoteListFn
    get?: OrganisationRemoteGetFn
  }
  [FirstClassResource.hub]: {
    list?: HubRemoteListFn
    get?: HubRemoteGetFn
  }
  [FirstClassResource.project]: RemoteMapEntry
  [FirstClassResource.layer]: {
    list?: LayerRemoteListFn
    get?: LayerRemoteGetFn
  }
  [FirstClassResource.feature]: RemoteMapEntry
  [FirstClassResource.task]: RemoteMapEntry
  [FirstClassResource.property]: RemoteMapEntry
  [FirstClassResource.user]: RemoteMapEntry
}

export type RemoteMap = { [Key in FirstClassResource]: RemoteMapEntryByResource[Key] }

export type ImageCtxMode = 'standalone' | 'gallery' | 'carousel'
export type ImageCtxState = {
  mode: ImageCtxMode

  ctxType: ImageContextResource | null
  ctxTypeSecondary: ImageContextResourceExtended | null
  ctxId: Id | null
  ctxIdSecondary: Id | null

  organisation: OrganisationDB | null
  project: ProjectDB | null

  highlightedIds: Id[]
  uploadQueue: ImageUpload[]
  loadStatus: Record<string, LoadStatus>
  activeId: string | null
  images: ImageCtxEnvelope[]
  preloadedImages: Set<string>
  pendingConfirmation: SvelteSet<string>
  deletionQueue: SvelteSet<string>
  rejected: File[]
  thumbnailLoadStatus: Record<string, LoadStatus>
}

export type ImageCtxOptions = {
  mode: ImageCtxMode
  isAdminMode: boolean
  ctxType: ImageContextResource
  ctxId: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  image?: ImageCtxEnvelope
  ctxTypeSecondary?: ImageContextResourceExtended
  ctxIdSecondary?: Id
  highlightedIds?: Id[]
}

/* ----------------- */
// GEOCODING
/* -------- */

export type ParsedReverseGeocodeResultI18n = {
  displayAddress: string | undefined | null
  displayAddressGen: boolean
  addressProperties: Partial<AddressProperties>
}

// IDENTIFY RESULT
export interface ParsedReverseGeocodeResult {
  addressMeta: AddressMeta
  i18n: Record<LocaleKey, ParsedReverseGeocodeResultI18n>
}

export interface ReverseGeocodeResult {
  address: {
    Street: string
    Neighborhood: string | null
    City: string
    Subregion: string | null
    State: string
    Country: string | null
    Match_addr: string
    Loc_name: string
  }
  location: {
    x: number
    y: number
    spatialReference: {
      wkid: number
      latestWkid: number
    }
  }
}

// ALS RESULT
// Data Dictionary is available at:
// https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
export interface ALSResult {
  // Input address information provided in the search request
  RequestAddress: {
    AddressLine: string[]
  }
  // List of suggested addresses that match the search criteria
  SuggestedAddress?: Array<{
    Address: {
      PremisesAddress: {
        // English address components
        EngPremisesAddress: {
          // Building/Block information
          EngBlock: {
            BlockDescriptor: string // Block type (e.g., "BLK", "TOWER")
            BlockNo: string // Block number
            BlockDescriptorPrecedenceIndicator: string // Whether BlockDescriptor appears before BlockNo
          }
          BuildingName: string // English name of the building
          // Estate information
          EngEstate: {
            EstateName: string // English name of the estate
            EngPhase?: {
              // Optional phase information
              PhaseName?: string
              PhaseNo?: string
            }
          }
          // Street information
          EngStreet: {
            StreetName: string // English street name
            BuildingNoFrom: string // Starting street number
            BuildingNoTo?: string // Optional ending street number
            EngVillage?: {
              LocationName: string
            }
          }
          // District information
          EngDistrict: {
            DcDistrict: string // English district name
          }
          Region: 'HK' | 'KLN' | 'NT' // Area code (HK/KLN/NT)
        }
        // Chinese address components
        ChiPremisesAddress: {
          // Building/Block information
          ChiBlock: {
            BlockDescriptor: string // Block type in Chinese (e.g., "座", "樓")
            BlockNo: string // Block number
            BlockDescriptorPrecedenceIndicator?: string
          }
          BuildingName: string // Chinese name of the building
          // Estate information
          ChiEstate: {
            EstateName: string // Chinese name of the estate
            ChiPhase?: {
              // Optional phase information
              PhaseName?: string
              PhaseNo?: string
            }
          }
          // Street information
          ChiStreet: {
            StreetName: string // Chinese street name
            BuildingNoFrom: string // Starting street number
            BuildingNoTo?: string // Optional ending street number
          }
          // District information
          ChiDistrict: {
            DcDistrict: string // Chinese district name
          }
          Region: '香港' | '九龍' | '新界' // Area in Chinese
        }
        // Unique identifier for the address
        GeoAddress: string // Unique address reference number
        // Spatial coordinates
        GeospatialInformation: {
          Northing: string // HK1980 Grid Northing
          Easting: string // HK1980 Grid Easting
          Latitude: string // WGS84 latitude
          Longitude: string // WGS84 longitude
        }
      }
    }
    // Address matching confidence
    ValidationInformation: {
      Score: number // Confidence score (0-100)
    }
  }>
}

export type NeighbourhoodJSON = Record<
  Ref,
  {
    i18n: Record<LocaleKey, NeighbourhoodI18n>
  }
>

export type Neighbourhood = {
  neighbourhood: string
  data: {
    neighbourhood: string
    area: string
    district: string
  }
}

export type NeighbourhoodI18n = {
  name: string
  neighbourhood: string
  area: string
  district: string
}

export type NeighbourhoodResource = {
  id: Ref
  i18n: Record<LocaleKey, NeighbourhoodI18n>
}

export type ALSSuggestedAddressItem = NonNullable<ALSResult['SuggestedAddress']>[number]

/* ----------------- */
// USER :: PROFILES
/* -------- */

export type ContributedFeature = {
  id: string
  title: string
  displayAddress: string
  href: string
  hierarchy: ResourceContext
  createdAt: string
}

export type ContributedImage = Image & {
  id: string
  href: string
  url: string
  hierarchy: ResourceContext
  createdAt: string
}

export type GroupedFeatures = {
  [projectId: string]: {
    id: Id
    name: string
    code: string
    organisation: {
      name: string
      code: string
    }
    features: ContributedFeature[]
  }
}

export type GroupedImages = {
  [projectId: string]: {
    id: Id
    name: string
    code: string
    organisation: {
      name: string
      code: string
    }
    images: ContributedImage[]
  }
}

/* ----------------- */
// TYPESCRIPT UTILITIES
/* -------- */

// RECURSIVE PARTIAL
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

// Only make some keys optional
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// Make all keys optional except for the ones in K
export type PartialExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>

/* ----------------- */
// GUARDS
/* -------- */

// Type guard to narrow the type
/**
 * Narrows a resource union to organisation/project resources.
 * Used when logic depends on code-based references shared by these resource types.
 */
export function isOrganisationOrProject(
  resource: Resource,
): resource is Organisation | Project {
  return 'code' in resource
}

// Type guards for resource types
/**
 * Type guard for organisation resources.
 * Used to safely access organisation-only fields in generic resource handlers.
 */
export function isOrganisation(resource: Resource): resource is Organisation {
  return (
    !('organisationId' in resource) &&
    !('layerId' in resource) &&
    !('featureId' in resource) &&
    !('projectId' in resource) &&
    'userRoles' in resource
  )
}

/**
 * Type guard for project resources.
 * Used to safely branch into project-specific processing paths.
 */
export function isProject(resource: Resource): resource is Project {
  return (
    'organisationId' in resource &&
    !('projectId' in resource) &&
    !('domain' in resource)
  )
}

/**
 * Type guard for layer resources.
 * Used when consuming hierarchical resources with layer-specific fields.
 */
export function isLayer(resource: Resource): resource is Layer {
  return 'projectId' in resource && !('layerId' in resource)
}

/**
 * Type guard for feature resources.
 * Used to narrow union types before feature-specific operations.
 */
export function isFeature(resource: Resource): resource is Feature {
  return 'layerId' in resource && !('featureId' in resource)
}

/**
 * Type guard for hub resources.
 * Used by generic resource utilities that branch by first-class type.
 */
export function isHub(resource: Resource): resource is Hub {
  return 'organisation' in resource && 'domain' in resource
}

/**
 * Type guard for task resources.
 * Used to isolate task-specific behavior in mixed resource pipelines.
 */
export function isTask(resource: Resource): resource is Task {
  const fields = ['organisationId', 'projectId', 'layerId', 'featureId']
  return fields.every(field => field in resource)
}

/* ----------------- */
// VIRUAL LIST
/* -------- */

// Courtesy of https://github.com/humanspeak/svelte-virtual-list/blob/main/src/lib/types.ts

/**
 * Defines the scroll direction and rendering mode for the virtual list.
 *
 * @typedef {'topToBottom' | 'bottomToTop'} SvelteVirtualListMode
 */
export type SvelteVirtualListMode = 'topToBottom' | 'bottomToTop'

/**
 * Configuration properties for the SvelteVirtualList component.
 *
 * @typedef {Object} SvelteVirtualListProps
 */
export type SvelteVirtualListProps = {
  /**
   * Number of items to render outside the visible viewport for smooth scrolling.
   * @default 20
   */
  bufferSize?: number
  /**
   * CSS class to apply to the outer container element.
   */
  containerClass?: string
  /**
   * CSS class to apply to the content wrapper element.
   */
  contentClass?: string
  /**
   * Initial height estimate for each item in pixels. Used for optimization before actual measurements are available.
   * @default 40
   */
  defaultEstimatedItemHeight?: number
  /**
   * When true, enables debug mode with additional logging and information.
   * @default false
   */
  debug?: boolean
  /**
   * Custom callback to handle debug information. Receives a SvelteVirtualListDebugInfo object.
   */
  debugFunction?: (_info: SvelteVirtualListDebugInfo) => void
  /**
   * The complete array of items to be virtualized.
   */
  items: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  /**
   * CSS class to apply to individual item containers.
   */
  itemsClass?: string
  /**
   * Determines the scroll and render direction.
   * @default 'topToBottom'
   */
  mode?: SvelteVirtualListMode
  /**
   * Svelte snippet function that defines how each item should be rendered. Receives the item and its index as arguments.
   */
  renderItem: Snippet<[item: any, index: number]> // eslint-disable-line @typescript-eslint/no-explicit-any
  /**
   * Base test ID for component elements to facilitate testing.
   */
  testId?: string
  /**
   * CSS class to apply to the scrollable viewport element.
   */
  viewportClass?: string
  /**
   * Top padding in pixels for the viewport (affects content height calculation).
   * @default 0
   */
  viewportPaddingTop?: number
}

/**
 * Debug information provided by the virtual list during rendering.
 */
export type SvelteVirtualListDebugInfo = {
  /** Index of the last rendered item in the viewport. */
  endIndex: number
  /** Index of the first rendered item in the viewport. */
  startIndex: number
  /** Total number of items in the list. */
  totalItems: number
  /** Number of items currently visible in the viewport. */
  visibleItemsCount: number
  /** Number of items processed in the viewport. */
  processedItems: number
  /** Average height of the processed items in pixels. */
  averageItemHeight: number
}
