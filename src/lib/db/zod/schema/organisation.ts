// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { organisation, organisationI18n, organisationRole } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { getDefaultConstraints, getLocales, getUserRoles } from '../constraints'
import { FormBoolean } from '../form'
import { UserBasic } from './user'
import { ImageBase, ImageContextEnvelopeAPI } from './image'
import { HubBasic } from './hub'

/* ----------------- */
// ORGANISATION CORE SCHEMAS
/* -------- */

export const OrganisationBase = createSelectSchema(organisation)
export const OrganisationInsert = createInsertSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
  code: z.string().min(2, { message: m.admin__validation_short_name_lte_32_chars() }),
})
export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
})

/* ----------------- */
// ORGANISATION RELATIONAL SCHEMAS
/* -------- */

export const OrganisationI18nBase = createSelectSchema(organisationI18n)
export const OrganisationI18nInsert = createInsertSchema(organisationI18n)
  .extend({
    ...getDefaultConstraints(organisationI18n),
  })
  .omit({
    organisationId: true,
  })
export const OrganisationI18nUpdate = createUpdateSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n),
})

export const OrganisationRoleBase = createSelectSchema(organisationRole)
export const OrganisationRoleWithUser = OrganisationRoleBase.extend({
  user: UserBasic,
})
export const OrganisationRoleInsert = createInsertSchema(organisationRole)
export const OrganisationRoleInsertExtra = OrganisationRoleInsert.extend({
  user: UserBasic,
}).omit({
  organisationId: true,
})
export const OrganisationRoleUpdate = createUpdateSchema(organisationRole)
export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserBasic,
})

export const OrganisationRoleAPI = OrganisationRoleBase.extend({
  organisation: OrganisationBase.extend({
    i18n: getLocales(OrganisationI18nBase),
  }),
})

/* ----------------- */
// ORGANISATION SUPERADMIN API (Full Access)
/* -------- */

export const OrganisationCollectionSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
  hub: HubBasic.nullish(),
})

export const OrganisationSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  userRoles: getUserRoles(OrganisationRoleWithUser),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
  hub: HubBasic.nullish(),
})

export const OrganisationInsertSuperAdminAPI = OrganisationInsert.extend({
  i18n: getLocales(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsertExtra),
})

export const OrganisationUpdateSuperAdminAPI = OrganisationUpdate.extend({
  i18n: getLocales(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra),
})

/* ----------------- */
// ORGANISATION API (Regular Users - Omit SuperAdmin Fields)
/* -------- */

export const OrganisationCollectionAPI = OrganisationCollectionSuperAdminAPI.omit({
  isCoreInclusive: true, // Only SuperAdmins can see this field
})

export const OrganisationAPI = OrganisationSuperAdminAPI.omit({
  isCoreInclusive: true, // Only SuperAdmins can see this field
})

export const OrganisationInsertAPI = OrganisationInsertSuperAdminAPI.omit({
  isCoreInclusive: true, // Only SuperAdmins can set this field
})

export const OrganisationUpdateAPI = OrganisationUpdateSuperAdminAPI.omit({
  isCoreInclusive: true, // Only SuperAdmins can update this field
})

/* ----------------- */
// ORGANISATION INTERMEDIATE SCHEMAS
/* -------- */

export const OrganisationRaw = OrganisationBase.extend({
  i18n: z.array(OrganisationI18nBase),
  userRoles: z.array(OrganisationRoleBase),
  image: ImageBase.nullish(),
})

/* ----------------- */
// Remote Function Refactor
/* -------- */

export const OrganisationI18nFormData = z.object({
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
  nameGen: FormBoolean.default(false),
  nameShortGen: FormBoolean.default(false),
  descriptionGen: FormBoolean.optional(),
})

export const OrganisationRoleFormData = z.object({
  userId: z.string().min(1),
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
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  url: z.union([z.literal(''), z.url({ message: m.admin__validation_url_invalid() })]),
  i18n: OrganisationI18nByLocaleFormData,
  userRoles: OrganisationUserRolesFormData,
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

// Frontend-only preflight schemas (no DB lookups/uniqueness checks).
// Keep these structurally aligned with submit payloads.
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

// Profiles

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
