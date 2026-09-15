import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type {
  FirstClassResource,
  SupportedLocales,
  FieldDiscriminator as FieldDiscriminatorEnum,
} from '$lib/enums'
import type {
  Feature,
  FeatureFromCollection,
  FeatureI18nDB,
  FeatureNew,
} from '$lib/db/zod/schema/feature.types'
import type { Layer, LayerI18nDB, LayerNew } from '$lib/db/zod/schema/layer.types'
import type {
  Project,
  ProjectI18nDB,
  ProjectNew,
  ProjectRole,
} from '$lib/db/zod/schema/project.types'
import type {
  Organisation,
  OrganisationI18nDB,
  OrganisationNew,
  OrganisationRole,
} from '$lib/db/zod/schema/organisation.types'
import type {
  SessionSession as BetterAuthSessionSession,
  SessionUser as BetterAuthSessionUser,
} from '$lib/auth'
import type { Hub, HubNew, HubRole } from '$lib/db/zod/schema/hub.types'
import type { Task, TaskNew } from '$lib/db/zod'
import type { Property } from '$lib/db/zod/schema/property.types'

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

export type DbTable = SQLiteTable

// Drizzle withRelations
export type NestedRelations = {
  [key: string]: boolean | { columns: NestedRelations } | { with: NestedRelations }
}

/* ----------------- */
// RESOURCES
/* -------- */

export type NavigableResource = Exclude<FirstClassResource, FirstClassResource.property>

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

// RELATED TYPES
export type FormI18n<T> = Record<Locale, T>

export type LocaleKey = 'en' | 'zhHans' | 'zhHant'

export type FieldDiscriminator = `${FieldDiscriminatorEnum}`

export type UserRole = HubRole | OrganisationRole | ProjectRole

export type UserRoleDisco =
  | (HubRole & { type: 'hub' })
  | (OrganisationRole & { type: 'organisation' })
  | (ProjectRole & { type: 'project' })

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
