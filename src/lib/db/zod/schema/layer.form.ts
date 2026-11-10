import { SubmittedTabsSchema, validateModelTabs } from '#lib/forms/modelTabs.js'
import { FeatureIntentSettingsFormData } from '#lib/features/intents.js'
// ZOD
import { z } from 'zod'
// FORM DEPENDENCIES
import { m } from '#lib/i18n.js'
import { RelocationPolicySchema } from '#lib/locations/model.js'
import { FormBoolean } from '../form'
import { LayerMetadataSchema } from './layerMetadata'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FIELD AND RELATION SCHEMAS
// 2. RESOURCE FORM SCHEMAS
// ---

export const LayerI18nFormData = z.object({
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

export const LayerI18nByLocaleFormData = z.object({
  en: LayerI18nFormData,
  zhHans: LayerI18nFormData,
  zhHant: LayerI18nFormData,
})

export const LayerPropertyFormData = z.object({
  propertyId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) }),
  isVisible: FormBoolean.default(false),
  isUserContributable: FormBoolean.default(false),
})

/** Layer policy edits use the same JSON transport and revision fence as Project settings. */
export const LayerRelocationPolicyFormData = z.preprocess(
  value => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
  z
    .strictObject({
      policy: RelocationPolicySchema.nullable(),
      expectedRevision: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER - 1),
    })
    .optional(),
)

// ═══════════════════════
// 2. RESOURCE FORM SCHEMAS
// ═══════════════════════

export const LayerEntityFormData = z.object({
  featureIntentSettings: FeatureIntentSettingsFormData,
  relocationUpdatePolicy: LayerRelocationPolicyFormData,
  organisationId: z.string().optional(),
  projectId: z
    .string({ message: m.field_is_required({ field: 'Project' }) })
    .min(1, { message: m.field_is_required({ field: 'Project' }) }),
  i18n: LayerI18nByLocaleFormData,
  properties: z.array(LayerPropertyFormData).optional(),
  isDefaultVisible: FormBoolean.default(true),
  metadata: LayerMetadataSchema.optional().default({}),
})

export const LayerFormMeta = z.object({
  submittedTabs: SubmittedTabsSchema,
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: FormBoolean.optional(),
})

export const LayerFormData = z
  .object({
    meta: LayerFormMeta.optional(),
    data: LayerEntityFormData,
  })
  .superRefine((value, ctx) => validateModelTabs('layer', value, ctx))

export const LayerPreflightFormData = LayerFormData
