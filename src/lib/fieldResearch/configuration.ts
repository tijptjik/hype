// VALIDATION
import { z } from 'zod'
import { parseDisplayTemplate } from '#lib/templates/displayTemplate.js'

/** Session defaults are inherited independently by every configured layer. */
const featureDefaultFields = {
  featureType: z.string().min(1).max(80),
  isVisitable: z.boolean(),
  isIntangible: z.boolean(),
  isDraft: z.boolean(),
  isPendingReview: z.boolean(),
}
export const researchFeatureDefaultsSchema = z.object(featureDefaultFields).default({
  featureType: 'object',
  isVisitable: false,
  isIntangible: false,
  isDraft: true,
  isPendingReview: true,
})
const fieldVisibilitySchema = z.object({
  featureType: z.boolean(),
  isVisitable: z.boolean(),
  isIntangible: z.boolean(),
  isDraft: z.boolean(),
  isPendingReview: z.boolean(),
})
export const researchFieldVisibilitySchema = fieldVisibilitySchema.default({
  featureType: true,
  isVisitable: true,
  isIntangible: true,
  isDraft: true,
  isPendingReview: true,
})
export const researchPropertySettingsSchema = z.object({
  isVisible: z.boolean(),
  isRecordable: z.boolean(),
  defaultValue: z
    .union([
      z.string().max(5000),
      z.number().finite(),
      z.boolean(),
      z.null(),
      z.array(z.string().max(200)).max(100),
    ])
    .optional(),
})
export const researchPropertiesSchema = z.record(
  z.string().min(1).max(100),
  researchPropertySettingsSchema,
)
const titleTemplateSchema = z
  .string()
  .min(1)
  .max(4096)
  .superRefine((source, context) => {
    try {
      const parsed = parseDisplayTemplate(source)
      if (!parsed.dependencies.includes('session.sequence'))
        context.addIssue({
          code: 'custom',
          message: 'Add a Sequence component to the title template.',
        })
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid title template',
      })
    }
  })
export const researchConfigurationSchema = z.object({
  code: z.string().trim().min(1).max(100),
  defaults: researchFeatureDefaultsSchema,
  fieldVisibility: researchFieldVisibilitySchema,
  properties: researchPropertiesSchema,
  titleTemplate: titleTemplateSchema.default('{{session.code}}-{{000}}'),
})
export const researchLayerOverridesSchema = z.object({
  defaults: z.object(featureDefaultFields).partial().default({}),
  fieldVisibility: fieldVisibilitySchema.partial().default({}),
  properties: z
    .record(z.string().min(1).max(100), researchPropertySettingsSchema.partial())
    .default({}),
  titleTemplate: titleTemplateSchema.optional(),
})
export type ResearchConfiguration = z.infer<typeof researchConfigurationSchema>
export type ResearchLayerOverrides = z.infer<typeof researchLayerOverridesSchema>

/** Resolve layer choices without modifying the session defaults.
 * @param session Session configuration. @param overrides Optional per-layer choices.
 * @returns Configuration with explicit layer overrides applied.
 */
export function resolveResearchConfiguration(
  session: ResearchConfiguration,
  overrides?: ResearchLayerOverrides | null,
): ResearchConfiguration {
  return {
    ...session,
    defaults: { ...session.defaults, ...overrides?.defaults },
    fieldVisibility: { ...session.fieldVisibility, ...overrides?.fieldVisibility },
    properties: Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(session.properties),
          ...Object.keys(overrides?.properties ?? {}),
        ]),
      ].map(id => [
        id,
        {
          isVisible:
            overrides?.properties[id]?.isVisible ??
            session.properties[id]?.isVisible ??
            false,
          isRecordable:
            overrides?.properties[id]?.isRecordable ??
            session.properties[id]?.isRecordable ??
            false,
          defaultValue:
            overrides?.properties[id]?.defaultValue !== undefined
              ? overrides.properties[id].defaultValue
              : session.properties[id]?.defaultValue,
        },
      ]),
    ),
    titleTemplate: overrides?.titleTemplate ?? session.titleTemplate,
  }
}
