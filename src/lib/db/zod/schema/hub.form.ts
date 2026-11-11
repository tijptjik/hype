// TRANSLATION METADATA
import { automaticTranslationFormFields } from '#lib/i18n/automaticSchema.js'
import { SubmittedTabsSchema, modelFormSchema } from '#lib/forms/modelTabs.js'
import { FeatureIntentSettingsFormData } from '#lib/features/intents.js'
// ZOD
import { z } from 'zod'
// FORM DEPENDENCIES
import { ImageIntentSettingsFormData } from '#lib/images/intents.js'
import { HUB_CODE_PATTERN } from '#lib/hub-domains.js'
import { contentLocaleMap } from '#lib/i18n/contentRecords.js'
import { m } from '#lib/i18n.js'
import { HubSubscriptionService, HubRoleType } from '#lib/enums.js'
import {
  normalizeSubstackSessionCookie,
  normalizeSubstackSubscriptionId,
} from '#lib/api/external/substack.shared.js'
import { FormBoolean } from '../form'
import { ProjectPropertyFormData } from './property.form'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FIELD AND RELATION SCHEMAS
// 2. RESOURCE FORM SCHEMAS
// ---

export const HubI18nFormData = z.object({
  ...automaticTranslationFormFields,
  name: z
    .string()
    .max(128, { message: m.admin__validation_lte_128_chars() })
    .default(''),
  nameShort: z
    .string()
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() })
    .default(''),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  subscriptionBenefits: z
    .union([z.literal(''), z.string().max(8000), z.null()])
    .optional()
    .transform(value => (typeof value === 'string' ? value.trim() : '')),
  nameGen: FormBoolean.default(false),
  nameShortGen: FormBoolean.default(false),
  descriptionGen: FormBoolean.optional(),
  subscriptionBenefitsGen: FormBoolean.default(false),
  privacyPolicy: z
    .string()
    .max(16000, { message: 'Privacy policy must be 16,000 characters or fewer.' })
    .optional(),
  privacyPolicyGen: FormBoolean.default(false),
  termsOfService: z
    .string()
    .max(16000, { message: 'Terms of service must be 16,000 characters or fewer.' })
    .optional(),
  termsOfServiceGen: FormBoolean.default(false),
})

export const HubRoleFormData = z.object({
  userId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_user() }) }),
  role: z.enum(Object.values(HubRoleType) as [string, ...string[]]),
})

// Content languages are independent of the compiled application UI languages.
// A policy-only translation may omit names; the hub still needs a complete display identity.
export const HubI18nByLocaleFormData = contentLocaleMap(HubI18nFormData).refine(
  rows => Object.values(rows).some(row => row.name.trim() && row.nameShort.trim()),
  'Add a hub name and short name in at least one language.',
)

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

export const HubLayerFormData = z.object({
  hubId: z.string().min(1),
  layerId: z.string().min(1),
  isDefaultVisible: FormBoolean.default(false),
})

export const HubSubscriptionPlacementFormData = z.object({
  hubPanel: FormBoolean.default(false),
  topBar: FormBoolean.default(false),
  menu: FormBoolean.default(true),
})

// ═══════════════════════
// 2. RESOURCE FORM SCHEMAS
// ═══════════════════════

/** Validate the subscription dependency only when its controls are supplied.
 * @param data Submitted subscription fields. @param ctx Validation issues.
 * @returns Nothing; incomplete enabled subscriptions produce a field issue.
 */
function validateHubSubscription(
  data: { isSubscriptionAvailable?: boolean; subscriptionService?: string | null },
  ctx: z.RefinementCtx,
  path: PropertyKey[] = [],
): void {
  if (data.isSubscriptionAvailable && data.subscriptionService === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, 'subscriptionService'],
      message: m.field_is_required({ field: m.field_subscription_service() }),
    })
  }
}

export const HubEntityFormData = z
  .object({
    code: z
      .string()
      .min(1, { message: m.field_is_required({ field: m.field_code() }) })
      .min(2, { message: m.admin__validation_code_is_required() })
      .max(24, { message: m.admin__validation_code_lte_24_chars() })
      .regex(HUB_CODE_PATTERN, {
        message:
          'Use 2–24 lowercase letters, digits or hyphens; start and end with a letter or digit.',
      }),
    domain: z.union([z.literal(''), z.string().min(3).max(255)]),
    legalContactAddress: z
      .preprocess(
        (value: string | undefined) =>
          typeof value === 'string' ? value.trim() : value,
        z.union([z.literal(''), z.string().email().max(512)]),
      )
      .optional()
      .default('')
      .transform(value => value ?? ''),
    isSubscriptionAvailable: FormBoolean.default(false),
    subscriptionService: z
      .union([z.nativeEnum(HubSubscriptionService), z.null()])
      .optional()
      .transform(value => value ?? null),
    subscriptionId: z
      .union([z.literal(''), z.string().max(255), z.null()])
      .optional()
      .transform(value =>
        typeof value === 'string' ? normalizeSubstackSubscriptionId(value) : '',
      ),
    subscriptionSessionCookie: z
      .union([z.literal(''), z.string().max(4096), z.null()])
      .optional()
      .transform(value =>
        typeof value === 'string' ? normalizeSubstackSessionCookie(value) : '',
      ),
    subscriptionPlacement: HubSubscriptionPlacementFormData.default({
      hubPanel: false,
      topBar: false,
      menu: true,
    }),
    i18n: HubI18nByLocaleFormData,
    userRoles: HubUserRolesFormData.optional(),
    organisations: z.array(HubOrganisationFormData).optional(),
    layerDefaults: z.array(HubLayerFormData).optional(),
    featureIntentSettings: FeatureIntentSettingsFormData,
    imageIntentSettings: ImageIntentSettingsFormData,
    properties: z.array(ProjectPropertyFormData).optional(),
  })
  .superRefine((data, ctx) => validateHubSubscription(data, ctx))

export const HubFormMeta = z.object({
  submittedTabs: SubmittedTabsSchema,
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: FormBoolean.optional(),
})

export const HubFormData = modelFormSchema(
  'hub',
  HubFormMeta,
  HubEntityFormData,
).superRefine((value, ctx) => {
  if (value.meta?.submittedTabs) validateHubSubscription(value.data, ctx, ['data'])
})

export const HubPreflightFormData = HubFormData
