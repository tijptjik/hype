import { automaticTranslationStructuredFormFields } from '#lib/i18n/automaticSchema.js'
// ZOD
import { z } from 'zod'
// I18N
import { m } from '#lib/i18n.js'
import { contentLocaleMap, ContentTagInput } from '#lib/i18n/contentRecords.js'
// FORM HELPERS
import { FormBoolean } from '../form'
import {
  PropertyDataType,
  PropertyCardinality,
  PropertyPresentation,
  PropertyAudience,
} from '#lib/properties/value.js'

import {
  DateResolution,
  TimeMaxHour,
  isRangeProperty,
  rangeDomain,
  formatRangeEndpoint,
  parseRangeEndpoint,
} from '#lib/properties/range.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SHARED FIELD CONSTRAINTS
// 2. PROPERTY FORM SCHEMAS
// 3. REMOTE FUNCTION SCHEMAS
// ---

export const valueContract = {
  dateResolution: DateResolution.optional(),
  timeMaxHour: z.coerce.number().pipe(TimeMaxHour).optional(),
  dataType: PropertyDataType.optional(),
  cardinality: PropertyCardinality.optional(),
  presentation: PropertyPresentation.optional(),
  audience: PropertyAudience.optional(),
}

export const PROPERTY_KEY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const RANGE_FIELD_COMPONENT = 'RangeField'

/**
 * Apply the shared field contract to database writes and browser forms.
 * @param schema Schema whose parsed fields are checked.
 * @param requireRangeBounds Whether legacy numeric ranges require both bounds.
 * @returns The schema with field compatibility and range validation.
 */
export const withPropertyFieldRequirements = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  requireRangeBounds = true,
): TSchema =>
  schema.superRefine((value: unknown, ctx) => {
    if (!value || typeof value !== 'object') return

    const record = value as {
      isTranslatable?: unknown
      component?: unknown
      min?: unknown
      max?: unknown
      dataType?: string
      cardinality?: string
      presentation?: string
      type?: string
      dateResolution?: z.infer<typeof DateResolution>
      timeMaxHour?: 24 | 36
    }

    if (
      record.dataType &&
      record.dataType !== 'text' &&
      record.dataType !== 'link' &&
      !isRangeProperty(record) &&
      (record.isTranslatable !== false || record.type === 'classifier')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataType'],
        message: 'Typed scalars require a non-translatable specifier',
      })
    }
    if (isRangeProperty(record)) {
      if (
        record.component !==
          (record.dataType === 'dateRange' ? 'DateRangeField' : 'TimeRangeField') ||
        record.type === 'classifier' ||
        record.isTranslatable !== false ||
        (record.cardinality && record.cardinality !== 'one') ||
        (record.presentation && record.presentation !== 'text')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['dataType'],
          message:
            'Ranges require a non-translatable range specifier with one value and text presentation',
        })
      const bounds = rangeDomain({
        ...record,
        min: typeof record.min === 'number' ? record.min : null,
        max: typeof record.max === 'number' ? record.max : null,
      })
      if (
        !Number.isInteger(bounds.min) ||
        !Number.isInteger(bounds.max) ||
        bounds.min >= bounds.max
      )
        ctx.addIssue({
          code: 'custom',
          path: ['min'],
          message: 'Range minimum must precede maximum',
        })
      try {
        for (const bound of [bounds.min, bounds.max])
          if (
            parseRangeEndpoint(
              {
                dataType: record.dataType,
                dateResolution: record.dateResolution,
                timeMaxHour: record.timeMaxHour,
              },
              formatRangeEndpoint(
                { dataType: record.dataType, dateResolution: record.dateResolution },
                bound,
              ),
            ) !== bound
          )
            throw new Error('Invalid bound')
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['min'],
          message: 'Bounds must be valid calendar endpoints at the selected resolution',
        })
      }
    } else if (
      record.component === 'DateRangeField' ||
      record.component === 'TimeRangeField'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataType'],
        message: 'Choose the matching range data type',
      })
    }
    if (record.dataType === 'link') {
      if (
        record.component !== 'LinkField' ||
        record.type === 'classifier' ||
        record.isTranslatable !== false
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataType'],
          message:
            'Links require a LinkField specifier with scalar translation disabled',
        })
      }
      if (
        record.presentation !== 'labelledLinks' &&
        record.presentation !== 'numberedReferences'
      )
        ctx.addIssue({
          code: 'custom',
          path: ['presentation'],
          message: 'Choose a link presentation',
        })
    } else if (
      record.cardinality === 'many' ||
      record.component === 'LinkField' ||
      (record.presentation && record.presentation !== 'text')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataType'],
        message: 'Collections and link presentations require the link data type',
      })
    }

    if (record.component === 'PhoneField' && record.isTranslatable !== false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isTranslatable'],
        message: 'Phone fields must not be translatable',
      })
    }
    if (!requireRangeBounds || record.component !== RANGE_FIELD_COMPONENT) return

    if (record.min === undefined || record.min === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: m.field_is_required({ field: m.admin__forms_property_minimum() }),
      })
    }

    if (record.max === undefined || record.max === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: m.field_is_required({ field: m.admin__forms_property_maximum() }),
      })
    }
  }) as TSchema

// ═══════════════════════
// 2. PROPERTY FORM SCHEMAS
// ═══════════════════════

export const PropertyI18nFormData = z.object({
  ...automaticTranslationStructuredFormFields,
  label: z.string().max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  labelGen: FormBoolean.default(false),
  placeholder: z
    .string()
    .max(128, { message: m.admin__validation_lte_128_chars() })
    .optional(),
  placeholderGen: FormBoolean.default(false),
})

export const PropertyI18nByLocaleFormData = contentLocaleMap(
  PropertyI18nFormData,
).refine(rows => Object.values(rows).some(row => row.label.trim()), {
  message: m.field_is_required({ field: m.field_label() }),
})

export const PropertyValueI18nFormData = z.object({
  ...automaticTranslationStructuredFormFields,
  value: z.string(),
  valueGen: FormBoolean.default(false),
})

export const PropertyValueI18nByLocaleFormData = contentLocaleMap(
  PropertyValueI18nFormData,
).refine(rows => Object.values(rows).some(row => row.value.trim()), {
  message: m.field_is_required({ field: m.field_value() }),
})

export const ProjectPropertyValueFormData = z.object({
  id: z.string().optional(),
  propertyId: z.string().optional(),
  rank: z.coerce.number().int().optional(),
  value: z.string().optional(),
  i18n: PropertyValueI18nByLocaleFormData.optional(),
})

export const ProjectPropertyFormData = withPropertyFieldRequirements(
  z.object({
    ...valueContract,
    id: z.string().optional(),
    scope: z.enum(['hub', 'organisation', 'project']).default('project'),
    hubId: z.string().nullish().optional(),
    organisationId: z.string().nullish().optional(),
    projectId: z.string().optional(),
    isEnabled: FormBoolean.default(true),
    isDefaultEnabled: FormBoolean.default(false),
    type: z.string().min(1).optional(),
    isTranslatable: FormBoolean.optional(),
    key: z
      .string()
      .min(1, { message: m.field_is_required({ field: m.field_code() }) })
      .regex(PROPERTY_KEY_IDENTIFIER_REGEX, {
        message: m.admin__validation_key_valid_characters(),
      }),
    rank: z.coerce.number().int().optional(),
    component: z.string().min(1),
    min: z.coerce.number().int().nullish(),
    max: z.coerce.number().int().nullish(),
    values: z.array(ProjectPropertyValueFormData).nullish(),
    i18n: PropertyI18nByLocaleFormData,
  }),
)

// ═══════════════════════
// 3. REMOTE FUNCTION SCHEMAS
// ═══════════════════════

export const ProjectPropertiesQuery = z.object({
  projectId: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const ProjectPropertiesFormMeta = z.object({
  projectId: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  isAdminRequest: FormBoolean.optional(),
})

export const ProjectPropertiesFormEntity = z.object({
  projectId: z.string().min(1).optional(),
  properties: z.array(ProjectPropertyFormData),
})

export const ProjectPropertiesFormData = z.object({
  meta: ProjectPropertiesFormMeta.optional(),
  data: ProjectPropertiesFormEntity,
})
