import { automaticTranslationReadFields } from '#lib/i18n/automaticSchema.js'
// CONTENT LOCALES
import { ContentLocaleSettingsSchema } from '#lib/content-locales/settings.js'
import { MARKER_STYLE_CODES } from '#lib/features/markerStyle.js'
import { CARD_STYLE_CODES } from '#lib/features/cardStyle.js'
import { CompactAncestorsSchema } from './api'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '#lib/db/schema/index.js'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { getLocales } from '../constraints'
import {
  ProjectCapabilitiesBase,
  ProjectRoleCapabilitiesSchema,
  ProjectFlagsBase,
  ProjectLicenseBase,
} from './project.form'
import { PropertyAdminProfileAPI } from './property'
import { LayerCardProfileAPI, LayerRaw } from './layer'
import { ImageContextEnvelopeAPI } from './image'
import { MapStyleResolved } from './map'
import { UserBasic } from './user'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CAPABILITY SCHEMAS
//    - ProjectCapabilitiesSchema
//    - ProjectRoleCapabilitiesSchema
//
// 2. DB / RELATIONAL PRIMITIVES
//    - ProjectBase
//    - ProjectInsert
//    - ProjectUpdate
//    - ProjectI18nBase
//    - ProjectI18nInsert
//    - ProjectI18nUpdate
//    - ProjectRoleBase
//    - ProjectRoleInsert
//    - ProjectRoleUpdate
//    - ProjectRoleAPI
//    - ProjectRoleWithUser
//    - ProjectRoleUpdateExtra
//    - ProjectListRow
//    - ProjectCardRow
//    - ProjectAdminRow
//
// 3. REMOTE FORM SCHEMAS
//    - ProjectI18nFormData
//    - ProjectRoleFormData
//    - ProjectI18nByLocaleFormData
//    - ProjectUserRolesFormData
//    - ProjectEntityFormData
//    - ProjectFormMeta
//    - ProjectFormData
//    - ProjectPreflightFormData
//
// 4. REMOTE COMMAND SCHEMAS
//    - PublishProjectSchema
//    - RemoveProjectSchema
//    - GetProjectMapStylesSchema
//
// 5. REMOTE PROFILE SCHEMAS
//    - ProjectProfile
//    - ProjectListProfileAPI
//    - ProjectCardProfileAPI
//    - ProjectDetailProfileAPI
//    - ProjectAdminProfileAPI

// ═══════════════════════
// 1. CAPABILITY SCHEMAS
// ═══════════════════════

export {
  ProjectCapabilitiesSchema,
  ProjectRoleCapabilitiesSchema,
  ProjectLicenseSchema,
} from './project.form'

// ═══════════════════════
// 2. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const ProjectBase = createSelectSchema(project).extend({
  settings: ContentLocaleSettingsSchema.default({}),
  cardStyleCode: z.enum(CARD_STYLE_CODES).nullable().default(null),
  markerStyleCode: z.enum(MARKER_STYLE_CODES).nullable().default(null),
  flags: ProjectFlagsBase,
  capabilities: ProjectCapabilitiesBase,
  license: ProjectLicenseBase,
})

export const ProjectInsert = createInsertSchema(project).extend({
  settings: ContentLocaleSettingsSchema.default({}),
  cardStyleCode: z.enum(CARD_STYLE_CODES).nullable().default(null),
  markerStyleCode: z.enum(MARKER_STYLE_CODES).nullable().default(null),
  flags: ProjectFlagsBase,
  capabilities: ProjectCapabilitiesBase,
  license: ProjectLicenseBase,
})

export const ProjectUpdate = createUpdateSchema(project).extend({
  settings: ContentLocaleSettingsSchema.optional(),
  cardStyleCode: z.enum(CARD_STYLE_CODES).nullable().optional(),
  markerStyleCode: z.enum(MARKER_STYLE_CODES).nullable().optional(),
  flags: ProjectFlagsBase.optional(),
  capabilities: ProjectCapabilitiesBase.optional(),
  license: ProjectLicenseBase.optional(),
})

export const ProjectI18nBase = createSelectSchema(projectI18n).extend(
  automaticTranslationReadFields,
)

export const ProjectI18nInsert = createInsertSchema(projectI18n).omit({
  projectId: true,
  locale: true,
})

export const ProjectI18nUpdate = createUpdateSchema(projectI18n).omit({
  projectId: true,
  locale: true,
})

export const ProjectRoleBase = createSelectSchema(projectRole)

export const ProjectRoleInsert = createInsertSchema(projectRole).omit({
  projectId: true,
})

export const ProjectRoleUpdate = createUpdateSchema(projectRole)

export const ProjectRoleWithUser = ProjectRoleBase.extend({
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
  user: UserBasic.nullish(),
})

export const ProjectRoleUpdateExtra = createUpdateSchema(projectRole).extend({
  role: ProjectRoleBase.shape.role,
  user: UserBasic,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

export const ProjectRoleAPI = ProjectRoleBase.extend({
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

/**
 * Hydrated DB row used for list profile project queries.
 * Keeps i18n in array form because locale-map shaping happens in API services.
 */
export const ProjectListRow = ProjectBase.extend({
  i18n: z.array(ProjectI18nBase).nullish(),
  mapStyleAssignment: z.unknown().nullish(),
})

/**
 * Hydrated DB row used for card/detail project queries.
 * Extends the list row with raw image relation data for envelope shaping.
 */
export const ProjectCardRow = ProjectListRow.extend({
  image: z.unknown().nullish(),
  mapStyleAssignment: z.unknown().nullish(),
})

/**
 * Hydrated DB row used for admin project queries.
 * Includes role/user, property, image, and publisher relations needed by edit flows.
 */
export const ProjectAdminRow = ProjectBase.extend({
  i18n: z.array(ProjectI18nBase).nullish(),
  userRoles: z.array(ProjectRoleWithUser).nullish(),
  properties: z.array(PropertyAdminProfileAPI).nullish(),
  layers: z.array(LayerRaw).nullish(),
  image: z.unknown().nullish(),
  publisher: UserBasic.nullish(),
  mapStyleAssignment: z.unknown().nullish(),
})

// ═══════════════════════
// 3. REMOTE FORM SCHEMAS
// ═══════════════════════

export {
  ProjectI18nFormData,
  ProjectRoleFormData,
  ProjectI18nByLocaleFormData,
  ProjectUserRolesFormData,
  ProjectLayerFormData,
  ProjectLocationPolicyFormData,
  ProjectEntityFormData,
  ProjectFormMeta,
  ProjectFormData,
  ProjectPreflightFormData,
} from './project.form'

// ═══════════════════════
// 4. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  publishChildren: z.boolean().optional(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const RemoveProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const GetProjectMapStylesSchema = z.object({
  projectId: z.string().optional(),
  organisationId: z.string().optional(),
})

// ═══════════════════════
// 5. REMOTE PROFILE SCHEMAS
// ═══════════════════════

// Legacy selectors remain compatible while callers migrate to resource payload profiles.
export const ProjectProfile = z.enum([
  'compact',
  'default',
  'map',
  'full',
  'admin',
  'list',
  'card',
  'detail',
])

const ProjectListFields = ProjectBase.pick({
  settings: true,
  flags: true,
  cardStyleCode: true,
  markerStyleCode: true,
  useAllInOrgContext: true,
  id: true,
  organisationId: true,
  code: true,
  createdAt: true,
  modifiedAt: true,
})

const ProjectCardFields = ProjectBase.pick({
  isPublished: true,
  isArchived: true,
})

const ProjectDetailFields = ProjectCardFields

export const ProjectListProfileAPI = ProjectListFields.extend({
  i18n: getLocales(ProjectI18nBase),
  mapStyle: MapStyleResolved.nullish(),
})

export const ProjectCardProfileAPI = ProjectListProfileAPI.extend({
  ancestors: CompactAncestorsSchema.optional(),
  ...ProjectCardFields.shape,
  image: ImageContextEnvelopeAPI.nullish(),
})

export const ProjectDetailProfileAPI = ProjectCardProfileAPI.extend({
  license: ProjectLicenseBase,
  ...ProjectDetailFields.shape,
  mapStyle: MapStyleResolved.nullish(),
})

export const ProjectAdminProfileAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  userRoles: z.array(ProjectRoleWithUser).default([]),
  properties: z.array(PropertyAdminProfileAPI).nullish(),
  layers: z.array(LayerCardProfileAPI).nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
  mapStyle: MapStyleResolved.nullish(),
})

/** Minimal identity and action state for paged resource lists. */
export const ProjectCompactProfileAPI = ProjectBase.pick({
  settings: true,
  flags: true,
  cardStyleCode: true,
  markerStyleCode: true,
  useAllInOrgContext: true,
  id: true,
  isPublished: true,
  isArchived: true,
  modifiedAt: true,
  code: true,
  organisationId: true,
}).extend({
  // Older cached compact payloads may predate shared content settings.
  settings: ContentLocaleSettingsSchema.optional(),
  mapStyle: MapStyleResolved.nullish(),
  ancestors: CompactAncestorsSchema.optional(),
  i18n: getLocales(ProjectI18nBase.pick({ name: true, nameShort: true })),
})
