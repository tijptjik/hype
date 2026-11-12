// VALIDATION
import { z } from 'zod'
// CONTENT LOCALES
import { ContentTagInput } from './contentRecords'

export const AutomaticTranslationSchema = z.object({
  receipt: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  value: z.string().max(64_000),
  sourceLocale: ContentTagInput,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceText: z.string().max(64_000),
  provider: z.string().max(128),
  model: z.string().max(128).nullable(),
  generatedAt: z.string().datetime(),
})
export const AutomaticTranslationsSchema = z.record(
  z.string(),
  AutomaticTranslationSchema,
)
export const TranslationProvenanceSchema = z.record(
  z.string(),
  z
    .union([
      AutomaticTranslationSchema,
      z.object({ origin: z.literal('legacy-ai'), value: z.string().max(64_000) }),
    ])
    .and(
      z.object({
        humanVerified: z.boolean().optional(),
        acceptedValue: z.string().max(64_000),
        acceptedBy: z.string(),
        acceptedAt: z.string().datetime(),
      }),
    ),
)
export const automaticTranslationReadFields = {
  isAutomaticOnly: z.boolean().optional(),
  autoTranslated: AutomaticTranslationsSchema.nullish(),
  translationProvenance: TranslationProvenanceSchema.nullish(),
}

/** Decode metadata carried by one registered hidden remote-form control.
 * @param schema Metadata validator. @returns Schema accepting JSON transport or an object.
 */
function jsonField<T extends z.ZodType>(schema: T) {
  return z.preprocess((value: string) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }, schema)
}
export const automaticTranslationFormFields = {
  autoTranslated: z
    .record(z.string(), jsonField(AutomaticTranslationSchema))
    .optional(),
  translationProvenance: z
    .record(z.string(), jsonField(TranslationProvenanceSchema.valueType))
    .optional(),
}

/** Restore signed metadata into typed remote-form state without nullable HTML values.
 * @param value Persisted locale row. @returns Optional metadata maps ready for hidden controls.
 */
export function automaticMetadataForForm(value: unknown): {
  autoTranslated?: Record<string, string>
  translationProvenance?: Record<string, string>
} {
  if (!value || typeof value !== 'object') return {}
  const row = value as Record<string, unknown>
  const automatic = AutomaticTranslationsSchema.safeParse(row.autoTranslated)
  const provenance = TranslationProvenanceSchema.safeParse(row.translationProvenance)
  return {
    ...(automatic.success
      ? {
          autoTranslated: Object.fromEntries(
            Object.entries(automatic.data).map(([field, entry]) => [
              field,
              JSON.stringify(entry),
            ]),
          ),
        }
      : {}),
    ...(provenance.success
      ? {
          translationProvenance: Object.fromEntries(
            Object.entries(provenance.data).map(([field, entry]) => [
              field,
              JSON.stringify(entry),
            ]),
          ),
        }
      : {}),
  }
}

// Property commands also accept structured records from the import and catalogue editors.
export const automaticTranslationStructuredFormFields = {
  autoTranslated: z
    .record(
      z.string(),
      z.union([jsonField(AutomaticTranslationSchema), AutomaticTranslationSchema]),
    )
    .nullish(),
  translationProvenance: z
    .record(
      z.string(),
      z.union([
        jsonField(TranslationProvenanceSchema.valueType),
        TranslationProvenanceSchema.valueType,
      ]),
    )
    .nullish(),
}

/** Read one cached suggestion from either persisted or remote-form metadata.
 * @param row Locale row in storage or form shape. @param field Translatable field name.
 * @returns Valid candidate, or undefined for absent/malformed metadata.
 */
export function automaticTranslationFromRow(
  row: unknown,
  field: string,
): z.infer<typeof AutomaticTranslationSchema> | undefined {
  if (!row || typeof row !== 'object') return undefined
  const metadata = (row as { autoTranslated?: Record<string, unknown> }).autoTranslated
  let value = metadata?.[field]
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  const parsed = AutomaticTranslationSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Read verification independently from publication for a current field value.
 * @param raw Serialized or decoded acceptance. @param value Current field text.
 * @returns Whether this exact accepted value remains unverified AI text.
 */
export function unverifiedAcceptance(raw: unknown, value: unknown): boolean {
  try {
    const acceptance = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = TranslationProvenanceSchema.valueType.safeParse(acceptance)
    return (
      parsed.success &&
      parsed.data.humanVerified === false &&
      parsed.data.acceptedValue === value
    )
  } catch {
    return false
  }
}
