// ZOD
import { z } from 'zod'
// FORM DEPENDENCIES
import { OrganisationUserPolicyFormSchema } from '#lib/organisation-users/policy.js'
import { OrganisationSettingsFormSchema } from '#lib/organisations/settings.js'
import { m } from '#lib/i18n.js'
import { contentLocaleMap } from '#lib/i18n/contentRecords.js'
import { FormBoolean } from '../form'
import { ProjectPropertyFormData } from './property.form'
// TYPES
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
  CapabilityKey,
} from '#lib/capabilities.types.js'
import type { ProjectRoleCapabilities } from './project.types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CAPABILITY SCHEMAS
// 2. ORGANISATION FORM SCHEMAS
// ---

export const CabilityDefinitionSchema: z.ZodType<CapabilityDefinition> = z.object({
  i18n: contentLocaleMap(z.string()).optional(),
})

export const CapabilityRoot: z.ZodType<CapabilityDefinitions> = z.record(
  z.custom<CapabilityKey>(),
  CabilityDefinitionSchema,
)

export const OrganisationRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: z.boolean().optional(),
    manageVolunteers: z.boolean().optional(),
    manageDropOffs: z.boolean().optional(),
    viewAnalytics: z.boolean().optional(),
  })

/**
 * Decode capabilities submitted through JSON form controls.
 * @param value Raw transport value.
 * @returns Decoded JSON, undefined for blank text, or the unchanged value.
 */
const toCapabilityValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

export const CapabilityBase = z.preprocess(value => {
  if (!Array.isArray(value)) return toCapabilityValue(value)

  const normalized = value
    .map(toCapabilityValue)
    .filter(item => item !== undefined && item !== null)
  if (normalized.length === 0) return undefined

  const objectCandidate = [...normalized]
    .reverse()
    .find(item => typeof item === 'object' && !Array.isArray(item))
  return objectCandidate ?? normalized[normalized.length - 1]
}, CapabilityRoot.optional())

// ═══════════════════════
// 2. ORGANISATION FORM SCHEMAS
// ═══════════════════════

export const OrganisationI18nFormData = z.object({
  name: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_name() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  nameShort: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_short_name() }) })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  nameGen: FormBoolean.default(false),
  nameShortGen: FormBoolean.default(false),
  descriptionGen: FormBoolean.optional(),
})

export const OrganisationRoleFormData = z.object({
  userId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_user() }) }),
  role: z.enum(['member', 'owner']),
  viewAnalytics: FormBoolean.optional(),
})

export const OrganisationI18nByLocaleFormData = z.object({
  en: OrganisationI18nFormData,
  zhHans: OrganisationI18nFormData,
  zhHant: OrganisationI18nFormData,
})

export const OrganisationUserRolesFormData = z.preprocess(
  (value: z.input<typeof OrganisationRoleFormData>[] | undefined) =>
    value === undefined || value === null ? [] : value,
  z
    .array(OrganisationRoleFormData)
    .refine(schema => schema.length > 0, m.admin__validation_user_roles_add_user())
    .refine(
      schema => schema.map(user => user.role).some(role => role === 'owner'),
      m.admin__validation_user_roles_at_least_one_owner(),
    ),
)

export const OrganisationEntityFormData = z.object({
  userPolicy: OrganisationUserPolicyFormSchema,
  settings: OrganisationSettingsFormSchema,
  code: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) })
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  url: z.union([z.literal(''), z.url({ message: m.admin__validation_url_invalid() })]),
  capabilities: CapabilityBase,
  defaultLocationVisibility: z.enum(['shared', 'exclusive']).default('shared'),
  permitUserDetailsEdit: FormBoolean.optional(),
  i18n: OrganisationI18nByLocaleFormData,
  userRoles: OrganisationUserRolesFormData,
  properties: z.array(ProjectPropertyFormData).default([]),
})

export const OrganisationFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: FormBoolean.optional(),
})

export const OrganisationFormData = z.object({
  meta: OrganisationFormMeta.optional(),
  data: OrganisationEntityFormData,
})

export const OrganisationPreflightFormData = OrganisationFormData

export const OrganisationCreateFormData = OrganisationFormData.refine(
  value => !value.meta?.id,
  'Create forms cannot include an id',
)

export const OrganisationReplaceFormData = OrganisationFormData.refine(
  value => Boolean(value.meta?.id),
  'Replace forms require an id',
)

export const OrganisationUpdateFormData = z.object({
  meta: OrganisationFormMeta.extend({
    id: z.string().min(1),
    updatedAt: z.string().min(1),
    mode: z.literal('update').optional(),
  }),
  data: OrganisationEntityFormData.partial().refine(
    value => Object.keys(value).length > 0,
    'Update forms require at least one field',
  ),
})
