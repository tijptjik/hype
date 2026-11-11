// TRANSLATION METADATA
import {
  automaticTranslationStructuredFormFields,
  automaticTranslationFormFields,
} from '#lib/i18n/automaticSchema.js'
import { SubmittedTabsSchema, modelFormSchema } from '#lib/forms/modelTabs.js'
import {
  FeatureKindSchema,
  TargetContextSchema,
  AssociationRelationSchema,
} from '#lib/features/locationPolicy.js'
// ZOD
import { z } from 'zod'
import { FeatureTypeIdSchema } from '#lib/features/intents.js'
// FORM DEPENDENCIES
import { m } from '#lib/i18n.js'
import { contentLocaleMap } from '#lib/i18n/contentRecords.js'
import { FormBoolean } from '../form'
import {
  PropertyAdminProfileAPI,
  PropertyValueAdminProfileAPI,
} from './property.profile'
import { AddressMetaSchema } from '#lib/addresses/featureAddress.js'
import { LocationResetSchema } from '#lib/locations/reset.js'
import { LocationBrandEditSchema } from '#lib/locations/brandEdit.js'
import { decodeLocationFormValue } from '#lib/locations/form.js'
// TYPES
import type { AddressProperties } from '#lib/utils/address.types.js'
import type { GeometryObject } from 'geojson'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FIELD AND RELATION SCHEMAS
// 2. RESOURCE FORM SCHEMAS
// ---

export const FeatureI18nFormData = z.object({
  ...automaticTranslationFormFields,
  nameOverride: z.string().max(1000).nullish(),
  title: z.string().max(128, { message: m.admin__validation_lte_128_chars() }),
  titleGen: FormBoolean.default(false),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  descriptionGen: FormBoolean.default(false),
  displayAddress: z
    .string()
    .max(512, { message: m.admin__validation_lte_128_chars() })
    .optional(),
  displayAddressGen: FormBoolean.default(false),
  addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
})

export const FeatureDraftI18nFormData = z.object({
  ...automaticTranslationFormFields,
  nameOverride: z.string().max(1000).nullish(),
  title: z.string().max(128, { message: m.admin__validation_lte_128_chars() }),
  titleGen: FormBoolean.default(false),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .default(''),
  descriptionGen: FormBoolean.default(false),
  displayAddress: z
    .string()
    .max(512, { message: m.admin__validation_lte_128_chars() })
    .default(''),
  displayAddressGen: FormBoolean.default(false),
  addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
})

export const FeaturePropertyI18nFormData = z.object({
  ...automaticTranslationStructuredFormFields,
  value: z.string().optional(),
  valueGen: FormBoolean.default(false),
})

export const FeaturePropertyI18nByLocaleFormData = contentLocaleMap(
  FeaturePropertyI18nFormData,
)

export const FeaturePropertyFormData = z.object({
  propertyId: z.string().min(1),
  value: z.string().optional().nullable(),
  valueJson: z.string().max(65536).nullish(),
  propertyValueId: z.string().optional().nullable(),
  i18n: FeaturePropertyI18nByLocaleFormData.optional(),
  property: PropertyAdminProfileAPI.optional(),
  propertyValue: PropertyValueAdminProfileAPI.nullish(),
})

// A selected empty locale is valid; at least one authored title is required overall.
export const FeatureI18nByLocaleFormData = contentLocaleMap(FeatureI18nFormData).refine(
  rows => Object.values(rows).some(row => row.title.trim().length > 0),
  { message: m.field_is_required({ field: m.feature__title() }) },
)

export const FeatureDraftI18nByLocaleFormData = contentLocaleMap(
  FeatureDraftI18nFormData,
)

// ═══════════════════════
// 2. RESOURCE FORM SCHEMAS
// ═══════════════════════

export const FeatureEntityFormData = z.object({
  featureType: FeatureTypeIdSchema.nullish(),
  nameOverrides: z
    .preprocess(decodeLocationFormValue, z.record(z.string(), z.string().max(1000)))
    .optional(),
  kind: FeatureKindSchema.nullish(),
  targetContext: TargetContextSchema.nullish(),
  associationRelation: AssociationRelationSchema.nullish(),

  locationNames: z
    .preprocess(
      decodeLocationFormValue,
      z.record(z.string().min(1).max(35), z.string().max(1000)),
    )
    .optional(),
  locationFieldModes: z
    .preprocess(
      decodeLocationFormValue,
      z.partialRecord(
        z.enum(['names', 'phoneNumber', 'brands', 'location']),
        z.enum(['community', 'internal']),
      ),
    )
    .optional(),
  locationNameMode: z.enum(['inherit', 'independent']).optional(),
  locationReset: z.preprocess(decodeLocationFormValue, LocationResetSchema).optional(),
  locationBrandEdit: z
    .preprocess(decodeLocationFormValue, LocationBrandEditSchema)
    .optional(),
  organisationId: z
    .string({ message: m.field_is_required({ field: m.field_organisation() }) })
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  projectId: z
    .string({ message: m.field_is_required({ field: 'Project' }) })
    .min(1, { message: m.field_is_required({ field: 'Project' }) }),
  layerId: z
    .string({ message: m.field_is_required({ field: 'Layer' }) })
    .min(1, { message: m.field_is_required({ field: 'Layer' }) }),
  contributorId: z.string().optional().nullable(),
  geometry: z.custom<GeometryObject>(),
  addressMeta: AddressMetaSchema.prefault({}).nullish(),
  isIntangible: FormBoolean.default(false),
  isVisitable: FormBoolean.default(true),
  isPendingReview: FormBoolean.default(false),
  isDraft: FormBoolean.default(false),
  i18n: FeatureI18nByLocaleFormData,
  properties: z.array(FeaturePropertyFormData).default([]),
})

export const FeatureDraftEntityFormData = z.object({
  featureType: FeatureTypeIdSchema.nullish(),
  nameOverrides: z
    .preprocess(decodeLocationFormValue, z.record(z.string(), z.string().max(1000)))
    .optional(),
  kind: FeatureKindSchema.nullish(),
  targetContext: TargetContextSchema.nullish(),
  associationRelation: AssociationRelationSchema.nullish(),

  locationNames: z
    .preprocess(
      decodeLocationFormValue,
      z.record(z.string().min(1).max(35), z.string().max(1000)),
    )
    .optional(),
  locationFieldModes: z
    .preprocess(
      decodeLocationFormValue,
      z.partialRecord(
        z.enum(['names', 'phoneNumber', 'brands', 'location']),
        z.enum(['community', 'internal']),
      ),
    )
    .optional(),
  locationNameMode: z.enum(['inherit', 'independent']).optional(),
  organisationId: z
    .string({ message: m.field_is_required({ field: m.field_organisation() }) })
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  projectId: z
    .string({ message: m.field_is_required({ field: 'Project' }) })
    .min(1, { message: m.field_is_required({ field: 'Project' }) }),
  layerId: z
    .string({ message: m.field_is_required({ field: 'Layer' }) })
    .min(1, { message: m.field_is_required({ field: 'Layer' }) }),
  contributorId: z.string().optional().nullable(),
  geometry: z.custom<GeometryObject>(),
  addressMeta: AddressMetaSchema.prefault({}).nullish(),
  isIntangible: FormBoolean.default(false),
  isVisitable: FormBoolean.default(true),
  isPendingReview: FormBoolean.default(false),
  isDraft: FormBoolean.default(false),
  i18n: FeatureDraftI18nByLocaleFormData,
  properties: z.array(FeaturePropertyFormData).default([]),
})

export const FeatureFormMeta = z.object({
  submittedTabs: SubmittedTabsSchema,
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: FormBoolean.optional(),
})

export const FeatureFormData = modelFormSchema(
  'feature',
  FeatureFormMeta,
  FeatureEntityFormData,
)

export const FeaturePreflightFormData = FeatureFormData
