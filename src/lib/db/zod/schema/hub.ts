// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  hub,
  hubI18n,
  hubRole,
  organisation,
  organisationI18n,
} from '$lib/db/schema/index'
// ZOD SCHEMAS
import { getLocales } from '../constraints'
import { FormBoolean } from '../form'
import { ImageBase, ImageContextEnvelopeAPI } from './image'
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
// 1. DB / RELATIONAL PRIMITIVES
//    - HubBase
//    - HubInsert
//    - HubUpdate
//    - HubI18nBase
//    - HubI18nInsert
//    - HubI18nUpdate
//    - HubRoleBase
//    - HubRoleWithUser
//    - HubRoleInsert
//    - HubRoleUpdate
//    - HubRaw
//    - HubOrganisationWithI18n
//
// 2. REMOTE FORM SCHEMAS
//    - HubI18nFormData
//    - HubRoleFormData
//    - HubI18nByLocaleFormData
//    - HubUserRolesFormData
//    - HubOrganisationFormData
//    - HubEntityFormData
//    - HubFormMeta
//    - HubFormData
//    - HubPreflightFormData
//
// 3. REMOTE COMMAND SCHEMAS
//    - PublishHubSchema
//    - RemoveHubSchema
//
// 4. REMOTE PROFILE SCHEMAS
//    - HubProfile
//    - HubListProfileAPI
//    - HubCardProfileAPI
//    - HubDetailProfileAPI
//    - HubAdminProfileAPI

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const HubBase = createSelectSchema(hub)

export const HubInsert = createInsertSchema(hub)

export const HubUpdate = createUpdateSchema(hub)

export const HubI18nBase = createSelectSchema(hubI18n)

export const HubI18nInsert = createInsertSchema(hubI18n).omit({
  hubId: true,
  locale: true,
})

export const HubI18nUpdate = createUpdateSchema(hubI18n).omit({
  hubId: true,
  locale: true,
})

export const HubRoleBase = createSelectSchema(hubRole)

export const HubRoleWithUser = HubRoleBase.extend({
  user: UserBasic,
})

export const HubRoleInsert = createInsertSchema(hubRole).omit({
  hubId: true,
})

export const HubRoleUpdate = createUpdateSchema(hubRole)

const HubOrganisationBase = createSelectSchema(organisation)
export const HubOrganisationWithI18n = HubOrganisationBase.extend({
  i18n: getLocales(createSelectSchema(organisationI18n)),
  image: ImageContextEnvelopeAPI.nullish(),
})

const HubOrganisationRaw = HubOrganisationBase.extend({
  i18n: z.array(createSelectSchema(organisationI18n)),
  image: ImageBase.nullish(),
})

export const HubRaw = HubBase.extend({
  i18n: z.array(HubI18nBase),
  image: ImageBase.nullish(),
  userRoles: z.array(HubRoleWithUser).nullish(),
  organisations: z.array(HubOrganisationRaw).nullish(),
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
// 2. REMOTE FORM SCHEMAS
// ═══════════════════════

export const HubI18nFormData = z.object({
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

export const HubRoleFormData = z.object({
  userId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_user() }) }),
  role: HubRoleBase.shape.role,
})

export const HubI18nByLocaleFormData = z.object({
  en: HubI18nFormData,
  zhHans: HubI18nFormData,
  zhHant: HubI18nFormData,
})

export const HubUserRolesFormData = z.preprocess(
  value => (value === undefined || value === null ? [] : value),
  z.array(HubRoleFormData).refine(schema => schema.length > 0, 'Add a User'),
)

export const HubOrganisationFormData = z.object({
  organisationId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  isCoreInclusive: FormBoolean.default(true),
  isHubExclusive: FormBoolean.default(false),
})

export const HubEntityFormData = z.object({
  code: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) })
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  domain: z.union([z.literal(''), z.string().min(3).max(255)]),
  i18n: HubI18nByLocaleFormData,
  userRoles: HubUserRolesFormData,
  organisations: z.array(HubOrganisationFormData).default([]),
  properties: z.array(ProjectPropertyFormData).default([]),
})

export const HubFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const HubFormData = z.object({
  meta: HubFormMeta.optional(),
  data: HubEntityFormData,
})

export const HubPreflightFormData = HubFormData

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishHubSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveHubSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

// ═══════════════════════
// 4. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export const HubProfile = z.enum(['list', 'card', 'detail', 'admin'])

const HubListFields = HubBase.pick({
  id: true,
  code: true,
  domain: true,
  createdAt: true,
  modifiedAt: true,
})

const HubCardFields = HubBase.pick({
  isPublished: true,
  isArchived: true,
})

export const HubListProfileAPI = HubListFields.extend({
  i18n: getLocales(HubI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
})

export const HubCardProfileAPI = HubListProfileAPI.extend({
  ...HubCardFields.shape,
})

export const HubDetailProfileAPI = HubCardProfileAPI.extend({
  userRoles: z.array(HubRoleWithUser),
  organisations: z.array(HubOrganisationWithI18n),
  properties: z.array(PropertyAdminProfileAPI).default([]),
})

export const HubAdminProfileAPI = HubDetailProfileAPI
