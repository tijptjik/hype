import { contentLocaleMap } from '#lib/i18n/contentRecords.js'
// TRANSLATION METADATA
import { automaticTranslationFormFields } from '#lib/i18n/automaticSchema.js'
import { SubmittedTabsSchema, modelFormSchema } from '#lib/forms/modelTabs.js'
import { FeatureIntentSettingsFormData } from '#lib/features/intents.js'
// ZOD
import { z } from 'zod'
// IMAGE INTENT POLICY
import { ImageIntentSettingsFormData } from '#lib/images/intents.js'
// CONTENT LOCALES
import { ContentLocaleSettingsFormSchema } from '#lib/content-locales/settings.js'
import { ProjectFlagsSchema } from '#lib/projects/flags.js'
import { ProjectLocationPolicySchema } from '#lib/locations/model.js'
import { MARKER_STYLE_CODES } from '#lib/features/markerStyle.js'
import { CARD_STYLE_CODES, DEFAULT_CARD_STYLE } from '#lib/features/cardStyle.js'
// I18N
import { m } from '#lib/i18n.js'
import {
  createDefaultProjectLicense,
  normalizeProjectLicense,
  parseProjectLicense,
} from '#lib/db/services/licence.js'
import { FormBoolean } from '../form'
import { ProjectPropertyFormData } from './property.form'
import { ProjectRoleType } from '#lib/enums.js'

// TYPES
import type {
  ProjectLicense,
  ProjectLicenseRights,
} from '#lib/db/zod/schema/projectLicense.types.js'
import type {
  ProjectCapabilities,
  ProjectRoleCapabilities,
} from '#lib/db/zod/schema/project.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SHARED CAPABILITY AND LICENSE SCHEMAS
// 2. PROJECT FORM SCHEMAS
// ---

export const ProjectCapabilitiesSchema: z.ZodType<ProjectCapabilities> = z.object({
  manageBakeries: FormBoolean.default(false),
  manageVolunteers: FormBoolean.default(false),
  manageDropOffs: FormBoolean.default(false),
  viewAnalytics: FormBoolean.default(false),
})

export const ProjectRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: FormBoolean.optional(),
    manageVolunteers: FormBoolean.optional(),
    manageDropOffs: FormBoolean.optional(),
    viewAnalytics: FormBoolean.optional(),
  })

/**
 * Decode the JSON transport shared by project form fields.
 * @param value Raw form or stored value.
 * @returns Decoded JSON, undefined for empty text, or the original value.
 */
const toProjectJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

export const ProjectCapabilitiesBase = z.preprocess(
  value => {
    if (!Array.isArray(value)) return toProjectJsonValue(value)

    const normalized = value
      .map(toProjectJsonValue)
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
    viewAnalytics: false,
  }),
)

const ProjectLicenseRightsSchema: z.ZodType<ProjectLicenseRights> = z.object({
  license: z.string().min(1).max(128),
  isPublicDomain: FormBoolean.default(false),
  isAllRightsReserved: FormBoolean.default(false),
  BY: FormBoolean.nullable().default(true),
  SA: FormBoolean.nullable().default(true),
  NC: FormBoolean.nullable().default(false),
  ND: FormBoolean.nullable().default(false),
})

const ProjectLicenseHistoryEntrySchema = z.object({
  publishedAt: z.string().min(1),
  attribution: z.string().max(128).default(''),
  licenses: z.object({
    all: z.string().min(1).max(128).optional(),
    image: z.string().min(1).max(128).optional(),
    text: z.string().min(1).max(128).optional(),
    data: z.string().min(1).max(128).optional(),
  }),
})

export const ProjectLicenseSchema: z.ZodType<ProjectLicense> = z.object({
  meta: z.object({
    allMediaSameRights: FormBoolean.default(true),
    attribution: z.string().max(128).default(''),
    isAllRightsReserved: FormBoolean.default(false),
    isPublicDomain: FormBoolean.default(false),
    history: z.array(ProjectLicenseHistoryEntrySchema).default([]),
  }),
  media: z.object({
    all: ProjectLicenseRightsSchema,
    image: ProjectLicenseRightsSchema,
    text: ProjectLicenseRightsSchema,
    data: ProjectLicenseRightsSchema,
  }),
})

export const ProjectFlagsBase = z.preprocess(
  toProjectJsonValue,
  ProjectFlagsSchema.default({}),
)

export const ProjectLicenseBase = z.preprocess(
  value => normalizeProjectLicense(parseProjectLicense(value)),
  ProjectLicenseSchema.default(createDefaultProjectLicense()),
)

// ═══════════════════════
// 2. PROJECT FORM SCHEMAS
// ═══════════════════════

export const ProjectI18nFormData = z.object({
  ...automaticTranslationFormFields,
  name: z.string().max(128, { message: m.admin__validation_lte_128_chars() }),
  nameGen: FormBoolean.default(false),
  nameShort: z
    .string()
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
  role: z.enum(Object.values(ProjectRoleType) as [string, ...string[]]),
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

export const ProjectI18nByLocaleFormData = contentLocaleMap(ProjectI18nFormData).refine(
  rows => Object.values(rows).some(row => row.name.trim() && row.nameShort.trim()),
  'Add a name and short name in at least one language.',
)

export const ProjectUserRolesFormData = z.array(ProjectRoleFormData)

const ProjectPropertiesFormData = z.array(ProjectPropertyFormData).optional()
export const ProjectLayerFormData = z.object({
  id: z.string().min(1),
  rank: z.coerce.number<number>().int().min(0).default(0),
  isDefaultVisible: FormBoolean.default(false),
})

/** Policy transport uses the same JSON field convention as project capabilities. */
export const ProjectLocationPolicyFormData = z.preprocess(
  toProjectJsonValue,
  z
    .object({
      policy: ProjectLocationPolicySchema,
      expectedRevision: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER - 1),
    })
    .optional(),
)

export const ProjectEntityFormData = z.object({
  settings: ContentLocaleSettingsFormSchema,
  featureIntentSettings: FeatureIntentSettingsFormData,
  imageIntentSettings: ImageIntentSettingsFormData,
  locationUpdatePolicy: ProjectLocationPolicyFormData,
  cardStyleCode: z.enum(CARD_STYLE_CODES).default(DEFAULT_CARD_STYLE),
  markerStyleCode: z
    .union([z.enum(MARKER_STYLE_CODES), z.literal('')])
    .nullable()
    .default(null)
    .transform(value => value || null),
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
  useAllInOrgContext: FormBoolean.default(false),
  i18n: ProjectI18nByLocaleFormData,
  license: ProjectLicenseBase,
  flags: ProjectFlagsBase,
  capabilities: ProjectCapabilitiesBase,
  userRoles: ProjectUserRolesFormData.optional(),
  properties: ProjectPropertiesFormData.optional(),
  // Saving selects the first layer when no default visibility was chosen.
  layers: z.array(ProjectLayerFormData).optional(),
})

export const ProjectFormMeta = z.object({
  submittedTabs: SubmittedTabsSchema,
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: FormBoolean.optional(),
  licenseTouched: z.coerce.boolean<boolean>().optional(),
})

export const ProjectFormData = modelFormSchema(
  'project',
  ProjectFormMeta,
  ProjectEntityFormData,
)

export const ProjectPreflightFormData = ProjectFormData
