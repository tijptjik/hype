// CONTENT LOCALES
import { ContentLocaleSettingsSchema } from '#lib/content-locales/settings.js'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  organisation,
  organisationI18n,
  organisationRole,
} from '#lib/db/schema/index.js'
import { CapabilityBase } from './organisation.form'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { getLocales } from '../constraints'
import { ImageBase } from './image'
import { PropertyRecordRaw } from './property'
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

export {
  CabilityDefinitionSchema,
  CapabilityRoot,
  OrganisationRoleCapabilitiesSchema,
} from './organisation.form'

// ═══════════════════════
// 2. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const OrganisationBase = createSelectSchema(organisation).extend({
  settings: ContentLocaleSettingsSchema.default({}),
  capabilities: CapabilityBase,
})

export const OrganisationInsert = createInsertSchema(organisation).extend({
  settings: ContentLocaleSettingsSchema.default({}),
  capabilities: CapabilityBase,
})

export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  settings: ContentLocaleSettingsSchema.optional(),
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

export const OrganisationRoleBase = createSelectSchema(organisationRole, {
  viewAnalytics: z.boolean().optional(),
}).omit({
  grant: true,
})

export const OrganisationRoleWithUser = OrganisationRoleBase.extend({
  user: UserBasic.nullish(),
})

export const OrganisationRoleInsert = createInsertSchema(organisationRole, {
  viewAnalytics: FormBoolean.optional(),
}).omit({
  grant: true,
  organisationId: true,
})

export const OrganisationRoleUpdate = createUpdateSchema(organisationRole, {
  viewAnalytics: FormBoolean.optional(),
}).omit({
  grant: true,
})

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

export {
  OrganisationI18nFormData,
  OrganisationRoleFormData,
  OrganisationI18nByLocaleFormData,
  OrganisationUserRolesFormData,
  OrganisationEntityFormData,
  OrganisationFormMeta,
  OrganisationFormData,
  OrganisationPreflightFormData,
  OrganisationCreateFormData,
  OrganisationReplaceFormData,
  OrganisationUpdateFormData,
} from './organisation.form'

// ═══════════════════════
// 4. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishOrganisationSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  publishChildren: z.boolean().optional(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const RemoveOrganisationSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

// ═══════════════════════
// 5. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export {
  OrganisationProfile,
  OrganisationListProfileAPI,
  OrganisationCardProfileAPI,
  OrganisationDetailProfileAPI,
  OrganisationAdminProfileAPI,
} from './organisation.profile'

/** Minimal identity and action state for paged resource lists. */
export const OrganisationCompactProfileAPI = OrganisationBase.pick({
  settings: true,
  id: true,
  isPublished: true,
  isArchived: true,
  modifiedAt: true,
  code: true,
}).extend({
  // Older cached compact payloads may predate shared content settings.
  settings: ContentLocaleSettingsSchema.optional(),
  i18n: getLocales(OrganisationI18nBase.pick({ name: true, nameShort: true })),
})
