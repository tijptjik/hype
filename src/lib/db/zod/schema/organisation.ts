// I18N
import { m } from '$lib/i18n'
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
  CapabilityKey,
} from '$lib/types'
import type { ProjectRoleCapabilities } from './project.types'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { organisation, organisationI18n, organisationRole } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { FormI18nRoot, getLocales } from '../constraints'
import { ImageContextEnvelopeAPI } from './image'
import { ImageBase } from './image'
import {
  ProjectPropertyFormData,
  PropertyAdminProfileAPI,
  PropertyRecordRaw,
} from './property'
import { UserBasic } from './user'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CAPABILITY SCHEMAS
//    - OrganisationCapabilityDefinitionSchema
//    - OrganisationCapabilityDefinitionsSchema
//    - OrganisationRoleCapabilitiesSchema
//
// 2. DB / RELATIONAL PRIMITIVES
//    - OrganisationBase
//    - OrganisationInsert
//    - OrganisationUpdate
//    - OrganisationI18nBase
//    - OrganisationI18nInsert
//    - OrganisationI18nUpdate
//    - OrganisationRoleBase
//    - OrganisationRoleWithUser
//    - OrganisationRoleInsert
//    - OrganisationRoleUpdate
//    - OrganisationRoleUpdateExtra
//    - OrganisationRoleAPI
//    - OrganisationRaw
//
// 3. REMOTE FORM SCHEMAS
//    - OrganisationI18nFormData
//    - OrganisationRoleFormData
//    - OrganisationI18nByLocaleFormData
//    - OrganisationUserRolesFormData
//    - OrganisationEntityFormData
//    - OrganisationFormMeta
//    - OrganisationFormData
//    - OrganisationPreflightFormData
//    - OrganisationCreateFormData
//    - OrganisationReplaceFormData
//    - OrganisationUpdateFormData
//
// 4. REMOTE COMMAND SCHEMAS
//    - PublishOrganisationSchema
//    - RemoveOrganisationSchema
//
// 5. REMOTE PROFILE SCHEMAS
//    - OrganisationProfile
//    - OrganisationListProfileAPI
//    - OrganisationCardProfileAPI
//    - OrganisationDetailProfileAPI
//    - OrganisationAdminProfileAPI

// ═══════════════════════
// 1. CAPABILITY SCHEMAS
// ═══════════════════════

export const CabilityDefinitionSchema: z.ZodType<CapabilityDefinition> = z.object({
  i18n: FormI18nRoot.optional(),
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
  })

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

const CapabilityBase = z.preprocess(value => {
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
// 2. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const OrganisationBase = createSelectSchema(organisation).extend({
  capabilities: CapabilityBase,
})

export const OrganisationInsert = createInsertSchema(organisation).extend({
  capabilities: CapabilityBase,
})

export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  capabilities: CapabilityBase.optional(),
})

export const OrganisationI18nBase = createSelectSchema(organisationI18n)

export const OrganisationI18nInsert = createInsertSchema(organisationI18n).omit({
  organisationId: true,
  locale: true,
})

export const OrganisationI18nUpdate = createUpdateSchema(organisationI18n).omit({
  organisationId: true,
  locale: true,
})

export const OrganisationRoleBase = createSelectSchema(organisationRole)

export const OrganisationRoleWithUser = OrganisationRoleBase.extend({
  user: UserBasic.nullish(),
})

export const OrganisationRoleInsert = createInsertSchema(organisationRole).omit({
  organisationId: true,
})

export const OrganisationRoleUpdate = createUpdateSchema(organisationRole)

export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserBasic,
})

export const OrganisationRoleAPI = OrganisationRoleBase.extend({
  user: UserBasic.nullish(),
})

export const OrganisationRaw = OrganisationBase.extend({
  i18n: z.array(OrganisationI18nBase),
  userRoles: z.array(OrganisationRoleWithUser).nullish(),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish(),
  properties: z.array(PropertyRecordRaw).nullish(),
  propertyAssignments: z
    .array(
      z.object({
        property: PropertyRecordRaw.nullish(),
      }),
    )
    .nullish(),
})

// ═══════════════════════
// 3. REMOTE FORM SCHEMAS
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
  role: OrganisationRoleBase.shape.role,
})

export const OrganisationI18nByLocaleFormData = z.object({
  en: OrganisationI18nFormData,
  zhHans: OrganisationI18nFormData,
  zhHant: OrganisationI18nFormData,
})

export const OrganisationUserRolesFormData = z.preprocess(
  value => (value === undefined || value === null ? [] : value),
  z
    .array(OrganisationRoleFormData)
    .refine(schema => schema.length > 0, m.admin__validation_user_roles_add_user())
    .refine(
      schema => schema.map(user => user.role).some(role => role === 'owner'),
      m.admin__validation_user_roles_at_least_one_owner(),
    ),
)

export const OrganisationEntityFormData = z.object({
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
  i18n: OrganisationI18nByLocaleFormData,
  userRoles: OrganisationUserRolesFormData,
  properties: z.array(ProjectPropertyFormData).default([]),
})

export const OrganisationFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
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

// ═══════════════════════
// 4. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishOrganisationSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveOrganisationSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

// ═══════════════════════
// 5. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export const OrganisationProfile = z.enum(['list', 'card', 'detail', 'admin'])

const OrganisationListFields = OrganisationBase.pick({
  id: true,
  code: true,
  createdAt: true,
  modifiedAt: true,
})

const OrganisationCardFields = OrganisationBase.pick({
  url: true,
  isPublished: true,
  isArchived: true,
})

const OrganisationDetailFields = OrganisationBase.pick({
  publishedAt: true,
  publisherId: true,
  hubId: true,
})

export const OrganisationListProfileAPI = OrganisationListFields.extend({
  i18n: getLocales(OrganisationI18nBase),
})

export const OrganisationCardProfileAPI = OrganisationListProfileAPI.extend({
  ...OrganisationCardFields.shape,
  image: ImageContextEnvelopeAPI.nullish(),
})

export const OrganisationDetailProfileAPI = OrganisationCardProfileAPI.extend({
  ...OrganisationDetailFields.shape,
})

export const OrganisationAdminProfileAPI = OrganisationDetailProfileAPI.extend({
  userRoles: z
    .array(OrganisationRoleBase.extend({ user: UserBasic.nullish() }))
    .default([]),
  capabilities: CapabilityBase,
  properties: z.array(PropertyAdminProfileAPI).default([]),
  publisher: UserBasic.nullish(),
})
