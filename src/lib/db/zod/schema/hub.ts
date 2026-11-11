import { automaticTranslationReadFields } from '#lib/i18n/automaticSchema.js'
// I18N
import { contentLocaleMap, ContentTagInput } from '#lib/i18n/contentRecords.js'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  hub,
  hubCounts,
  hubLayer,
  hubI18n,
  hubRole,
  hubUserState,
  layer,
  layerI18n,
  organisation,
  organisationI18n,
} from '#lib/db/schema/index.js'
// ZOD SCHEMAS
import { getLocales } from '../constraints'
import { FormBoolean } from '../form'
import { ImageBase, ImageContextEnvelopeAPI } from './image'
import { PropertyAdminProfileAPI, PropertyRecordRaw } from './property'
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
//    - HubUserStateBase
//    - HubLayerBase
//    - HubLayerWithLayer
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

export const HubI18nBase = createSelectSchema(hubI18n, {
  locale: ContentTagInput,
}).extend(automaticTranslationReadFields)

export const HubI18nInsert = createInsertSchema(hubI18n, {
  locale: ContentTagInput,
}).omit({
  hubId: true,
  locale: true,
})

export const HubI18nUpdate = createUpdateSchema(hubI18n, {
  locale: ContentTagInput,
}).omit({
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

export const HubUserStateBase = createSelectSchema(hubUserState)

export const HubLayerBase = createSelectSchema(hubLayer)

const HubLayerLayer = createSelectSchema(layer).extend({
  i18n: getLocales(
    createSelectSchema(layerI18n).extend(automaticTranslationReadFields),
  ),
})

export const HubLayerWithLayer = HubLayerBase.extend({
  layer: HubLayerLayer,
})

const HubOrganisationBase = createSelectSchema(organisation)
export const HubOrganisationWithI18n = HubOrganisationBase.extend({
  i18n: getLocales(
    createSelectSchema(organisationI18n).extend(automaticTranslationReadFields),
  ),
  image: ImageContextEnvelopeAPI.nullish(),
})

const HubOrganisationRaw = HubOrganisationBase.extend({
  i18n: z.array(
    createSelectSchema(organisationI18n).extend(automaticTranslationReadFields),
  ),
  image: ImageBase.nullish(),
})

const HubCounts = createSelectSchema(hubCounts).omit({ hubId: true })

export const HubRaw = HubBase.extend({
  counts: HubCounts.nullish(),
  i18n: z.array(HubI18nBase),
  image: ImageBase.nullish(),
  userRoles: z.array(HubRoleWithUser).nullish(),
  organisations: z.array(HubOrganisationRaw).nullish(),
  layerDefaults: z.array(HubLayerWithLayer).nullish(),
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

export {
  HubI18nFormData,
  HubRoleFormData,
  HubI18nByLocaleFormData,
  HubUserRolesFormData,
  HubOrganisationFormData,
  HubLayerFormData,
  HubSubscriptionPlacementFormData,
  HubEntityFormData,
  HubFormMeta,
  HubFormData,
  HubPreflightFormData,
} from './hub.form'

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishHubSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const RemoveHubSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const JoinHubSubscriptionSchema = z.object({
  hubId: z.string().min(1),
  hasAgreedToTerms: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const DismissHubSubscriptionPromptSchema = z.object({
  hubId: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
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
  legalContactAddress: true,
  createdAt: true,
  modifiedAt: true,
})

const HubCardFields = HubBase.pick({
  isPublished: true,
  isArchived: true,
})

const HubSubscriptionFields = HubBase.pick({
  isSubscriptionAvailable: true,
  subscriptionService: true,
  subscriptionId: true,
  subscriptionPlacement: true,
})

export const HubListProfileAPI = HubListFields.extend({
  counts: HubCounts.nullish(),
  i18n: contentLocaleMap(HubI18nBase).nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
})

export const HubCardProfileAPI = HubListProfileAPI.extend({
  ...HubCardFields.shape,
  ...HubSubscriptionFields.shape,
})

export const HubDetailProfileAPI = HubCardProfileAPI.extend({
  userRoles: z.array(HubRoleWithUser),
  organisations: z.array(HubOrganisationWithI18n),
  layerDefaults: z.array(HubLayerWithLayer).default([]),
  properties: z.array(PropertyAdminProfileAPI).default([]),
})

export const HubAdminProfileAPI = HubDetailProfileAPI.extend({
  subscriptionSessionCookie: HubBase.shape.subscriptionSessionCookie,
})
