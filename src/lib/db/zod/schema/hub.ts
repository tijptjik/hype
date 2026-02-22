// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  hub,
  hubI18n,
  hubRole,
  organisation,
  organisationI18n,
} from '$lib/db/schema/index'
// ZOD SCHEMAS
import { getDefaultConstraints, getLocales } from '../constraints'
import { UserBasic } from './user'
import { ImageContextEnvelopeAPI } from './image'

/* ----------------- */
// HUB CORE SCHEMAS
/* -------- */

export const HubBase = createSelectSchema(hub)

export const HubBasic = HubBase.pick({
  id: true,
  code: true,
  domain: true,
  isArchived: true,
} as const)

export const HubInsert = createInsertSchema(hub).extend({
  ...getDefaultConstraints(hub),
})

export const HubUpdate = createUpdateSchema(hub).extend({
  ...getDefaultConstraints(hub),
})

/* ----------------- */
// HUB RELATIONAL SCHEMAS
/* -------- */

export const HubI18nBase = createSelectSchema(hubI18n)
export const HubI18nInsert = createInsertSchema(hubI18n)
  .extend({
    ...getDefaultConstraints(hubI18n),
  })
  .omit({
    hubId: true,
  })
export const HubI18nUpdate = createUpdateSchema(hubI18n).extend({
  ...getDefaultConstraints(hubI18n),
})

export const HubRoleBase = createSelectSchema(hubRole)
export const HubRoleWithUser = HubRoleBase.extend({
  user: UserBasic,
})
export const HubRoleInsert = createInsertSchema(hubRole)
export const HubRoleInsertExtra = HubRoleInsert.extend({
  user: UserBasic,
}).omit({
  hubId: true,
})
export const HubRoleUpdate = createUpdateSchema(hubRole)
export const HubRoleUpdateExtra = HubRoleUpdate.extend({
  user: UserBasic,
})

const HubOrganisationBase = createSelectSchema(organisation)
export const HubOrganisationWithI18n = HubOrganisationBase.extend({
  i18n: getLocales(createSelectSchema(organisationI18n)),
  image: ImageContextEnvelopeAPI.nullish(),
})

/* ----------------- */
// HUB API
/* -------- */

export const HubCollectionAPI = HubBase.extend({
  i18n: getLocales(HubI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
})

export const HubAPI = HubCollectionAPI.extend({
  userRoles: z.array(HubRoleWithUser),
  organisations: z.array(HubOrganisationWithI18n),
})

export const HubInsertAPI = HubInsert.extend({
  i18n: getLocales(HubI18nInsert),
  userRoles: z.array(HubRoleInsertExtra).optional(),
  organisations: z
    .array(
      z.object({
        organisationId: z.string().min(1),
        isCoreInclusive: z.boolean(),
        isHubExclusive: z.boolean(),
      }),
    )
    .optional(),
})

export const HubUpdateAPI = HubUpdate.extend({
  i18n: getLocales(HubI18nUpdate),
  userRoles: z.array(HubRoleUpdateExtra).optional(),
  organisations: z
    .array(
      z.object({
        organisationId: z.string().min(1),
        isCoreInclusive: z.boolean(),
        isHubExclusive: z.boolean(),
      }),
    )
    .optional(),
})

/* ----------------- */
// HUB RAW SCHEMAS
/* -------- */

export const HubRaw = HubBase.extend({
  i18n: z.array(HubI18nBase).nullish(),
  image: z.unknown().nullish(),
  userRoles: z.array(HubRoleWithUser).nullish(),
  organisations: z.array(HubOrganisationWithI18n).nullish(),
})

/* ----------------- */
// POST REMOTE FUNCTION REFACTOR
/* -------- */

export const HubI18nFormData = z.object({
  name: z
    .string()
    .min(1, { message: m.admin__validation_name_is_required() })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  nameShort: z
    .string()
    .min(1, { message: m.admin__validation_short_name_is_required() })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  nameGen: z.boolean().default(false),
  nameShortGen: z.boolean().default(false),
  descriptionGen: z.boolean().optional(),
})

export const HubRoleFormData = z.object({
  userId: z.string().min(1),
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
  organisationId: z.string().min(1),
  isCoreInclusive: z.boolean().default(true),
  isHubExclusive: z.boolean().default(false),
})

export const HubEntityFormData = z.object({
  code: z
    .string()
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  domain: z.union([z.literal(''), z.string().min(3).max(255)]),
  imageId: z.string().min(1).nullable().optional(),
  i18n: HubI18nByLocaleFormData,
  userRoles: HubUserRolesFormData,
  organisations: z.array(HubOrganisationFormData).default([]),
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
})
