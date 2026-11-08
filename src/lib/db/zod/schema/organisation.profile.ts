// ZOD
import { z } from 'zod'
// SHARED CONTRACTS
import { ContentLocaleSettingsSchema } from '#lib/content-locales/settings.js'
import { OrganisationUserPolicySchema } from '#lib/organisation-users/policy.js'
import { OrganisationRoleType, supportedLocales } from '#lib/enums.js'
import { getLocales } from '../constraints'
import { CapabilityBase } from './organisation.form'
import { PropertyAdminProfileAPI } from './property.profile'
import { ImageContextEnvelopeAPI } from './image.profile'
import { UserBasic } from './userBasic'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SHARED READ FIELDS
// 2. ORGANISATION PROFILES
// ---

// Read fields needed by list, card, detail and editor cache validation.
const OrganisationBase = z.object({
  settings: ContentLocaleSettingsSchema.default({}),
  id: z.string(),
  code: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  url: z.string().nullable(),
  isPublished: z.boolean(),
  isArchived: z.boolean(),
  hubId: z.string().nullable(),
  defaultLocationVisibility: z.enum(['shared', 'exclusive']),
  publishedAt: z.string().nullable(),
  publisherId: z.string().nullable(),
  permitUserDetailsEdit: z.boolean(),
})
export const OrganisationI18nReadSchema = z.object({
  organisationId: z.string(),
  locale: z.enum(supportedLocales as [string, ...string[]]),
  name: z.string(),
  nameGen: z.boolean(),
  nameShort: z.string(),
  nameShortGen: z.boolean(),
  description: z.string().nullable(),
  descriptionGen: z.boolean(),
})
export const OrganisationRoleReadSchema = z.object({
  organisationId: z.string(),
  userId: z.string(),
  role: z.enum(Object.values(OrganisationRoleType) as [string, ...string[]]),
  viewAnalytics: z.boolean().optional(),
})

// ═══════════════════════
// 2. ORGANISATION PROFILES
// ═══════════════════════

// Legacy selectors remain compatible while callers migrate to resource payload profiles.
export const OrganisationProfile = z.enum([
  'compact',
  'default',
  'map',
  'full',
  'admin',
  'list',
  'card',
  'detail',
])

const OrganisationListFields = OrganisationBase.pick({
  settings: true,
  id: true,
  code: true,
  createdAt: true,
  modifiedAt: true,
})

const OrganisationCardFields = OrganisationBase.pick({
  url: true,
  isPublished: true,
  isArchived: true,
  hubId: true,
})

const OrganisationDetailFields = OrganisationBase.pick({
  defaultLocationVisibility: true,
  publishedAt: true,
  publisherId: true,
})

export const OrganisationListProfileAPI = OrganisationListFields.extend({
  i18n: getLocales(OrganisationI18nReadSchema),
})

export const OrganisationCardProfileAPI = OrganisationListProfileAPI.extend({
  ...OrganisationCardFields.shape,
  image: ImageContextEnvelopeAPI.nullish(),
})

export const OrganisationDetailProfileAPI = OrganisationCardProfileAPI.extend({
  ...OrganisationDetailFields.shape,
})

export const OrganisationAdminProfileAPI = OrganisationDetailProfileAPI.extend({
  permitUserDetailsEdit: OrganisationBase.shape.permitUserDetailsEdit,
  hub: z
    .object({ id: z.string(), code: z.string(), domain: z.string().nullish() })
    .nullish(),
  userPolicy: OrganisationUserPolicySchema.nullish(),
  userRoles: z
    .array(OrganisationRoleReadSchema.extend({ user: UserBasic.nullish() }))
    .default([]),
  capabilities: CapabilityBase,
  properties: z.array(PropertyAdminProfileAPI).default([]),
  publisher: UserBasic.nullish(),
})
