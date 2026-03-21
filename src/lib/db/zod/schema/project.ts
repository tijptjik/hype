// I18N
import { m } from '$lib/i18n'
import type { ProjectLicense, ProjectLicenseRights } from '$lib/types'
import {
  createDefaultProjectLicense,
  normalizeProjectLicense,
  parseProjectLicense,
} from '$lib/db/services/licence'
import type {
  ProjectCapabilities,
  ProjectRoleCapabilities,
} from '$lib/db/zod/schema/project.types'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { getLocales } from '../constraints'
import { ProjectPropertyFormData } from './property'
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

export const ProjectCapabilitiesSchema: z.ZodType<ProjectCapabilities> = z.object({
  manageBakeries: FormBoolean.default(false),
  manageVolunteers: FormBoolean.default(false),
  manageDropOffs: FormBoolean.default(false),
})

export const ProjectRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: FormBoolean.optional(),
    manageVolunteers: FormBoolean.optional(),
    manageDropOffs: FormBoolean.optional(),
  })

const toProjectCapabilitiesValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const ProjectCapabilitiesBase = z.preprocess(
  value => {
    if (!Array.isArray(value)) return toProjectCapabilitiesValue(value)

    const normalized = value
      .map(toProjectCapabilitiesValue)
      .filter(item => item !== undefined && item !== null)
    if (normalized.length === 0) return undefined

    const objectCandidate = [...normalized]
      .reverse()
      .find(item => typeof item === 'object' && !Array.isArray(item))
    return objectCandidate ?? normalized[normalized.length - 1]
  },
  ProjectCapabilitiesSchema.default({
    manageBakeries: false,
    manageVolunteers: false,
    manageDropOffs: false,
  }),
)

const ProjectLicenseRightsSchema: z.ZodType<ProjectLicenseRights> = z.object({
  license: z.string().min(1).max(128),
  BY: FormBoolean.nullable().default(true),
  SA: FormBoolean.nullable().default(true),
  NC: FormBoolean.nullable().default(false),
  ND: FormBoolean.nullable().default(false),
})

export const ProjectLicenseSchema: z.ZodType<ProjectLicense> = z.object({
  meta: z.object({
    allMediaSameRights: FormBoolean.default(true),
    attribution: z.string().max(128).default(''),
    isAllRightsReserved: FormBoolean.default(false),
    isPublicDomain: FormBoolean.default(false),
  }),
  media: z.object({
    all: ProjectLicenseRightsSchema,
    image: ProjectLicenseRightsSchema,
    text: ProjectLicenseRightsSchema,
    data: ProjectLicenseRightsSchema,
  }),
})

const ProjectLicenseBase = z.preprocess(
  value => normalizeProjectLicense(parseProjectLicense(value)),
  ProjectLicenseSchema.default(createDefaultProjectLicense()),
)

// ═══════════════════════
// 2. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const ProjectBase = createSelectSchema(project).extend({
  capabilities: ProjectCapabilitiesBase,
  license: ProjectLicenseBase,
})

export const ProjectInsert = createInsertSchema(project).extend({
  capabilities: ProjectCapabilitiesBase,
  license: ProjectLicenseBase,
})

export const ProjectUpdate = createUpdateSchema(project).extend({
  capabilities: ProjectCapabilitiesBase.optional(),
  license: ProjectLicenseBase.optional(),
})

export const ProjectI18nBase = createSelectSchema(projectI18n)

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

export const ProjectI18nFormData = z.object({
  name: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_name() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  nameGen: FormBoolean.default(false),
  nameShort: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_short_name() }) })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  nameShortGen: FormBoolean.default(false),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  descriptionGen: FormBoolean.optional(),
})

export const ProjectRoleFormData = z.object({
  userId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_user() }) }),
  role: ProjectRoleBase.shape.role,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

export const ProjectI18nByLocaleFormData = z.object({
  en: ProjectI18nFormData,
  zhHans: ProjectI18nFormData,
  zhHant: ProjectI18nFormData,
})

export const ProjectUserRolesFormData = z.array(ProjectRoleFormData)

const ProjectPropertiesFormData = z.array(ProjectPropertyFormData).optional()
export const ProjectLayerFormData = z.object({
  id: z.string().min(1),
  rank: z.coerce.number<number>().int().min(0).default(0),
  isDefaultVisible: FormBoolean.default(false),
})

export const ProjectEntityFormData = z.object({
  organisationId: z
    .string({ message: m.field_is_required({ field: m.field_organisation() }) })
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  mapStyleCode: z
    .string()
    .trim()
    .max(64, { message: m.admin__validation_lte_128_chars() })
    .optional()
    .default(''),
  code: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) })
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  i18n: ProjectI18nByLocaleFormData,
  license: ProjectLicenseBase,
  capabilities: ProjectCapabilitiesBase,
  userRoles: ProjectUserRolesFormData.optional(),
  properties: ProjectPropertiesFormData,
  layers: z.array(ProjectLayerFormData).optional(),
})

export const ProjectFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const ProjectFormData = z.object({
  meta: ProjectFormMeta.optional(),
  data: ProjectEntityFormData,
})

export const ProjectPreflightFormData = ProjectFormData

// ═══════════════════════
// 4. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
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

export const ProjectProfile = z.enum(['list', 'card', 'detail', 'admin'])

const ProjectListFields = ProjectBase.pick({
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
  ...ProjectCardFields.shape,
  image: ImageContextEnvelopeAPI.nullish(),
})

export const ProjectDetailProfileAPI = ProjectCardProfileAPI.extend({
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
