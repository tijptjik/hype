// TRANSLATION METADATA
import { TranslationProvenanceSchema, unverifiedAcceptance } from './automaticSchema.js'

/** Resolve the displayed verification state, including accepted AI text.
 * @param row Locale content and metadata. @param field Content field name.
 * @returns Whether this exact value is marked as machine generated.
 */
export function isGeneratedTranslation(
  row: object | undefined | null,
  field: string,
): boolean {
  const data = row as Record<string, unknown> | undefined | null
  const provenance = data?.translationProvenance as Record<string, unknown> | undefined
  return (
    data?.[`${field}Gen`] === true ||
    data?.[`${field}Gen`] === 'true' ||
    unverifiedAcceptance(provenance?.[field], data?.[field])
  )
}

/** Stage an explicit verification choice without changing text or translation receipts.
 * @param row Existing locale row. @param field Content field name.
 * @param generated Requested machine-generated state.
 * @param serializeMetadata Whether remote form controls require JSON strings.
 * @returns A new row retaining unrelated content, languages and metadata.
 * @remarks Accepted AI remains published in either verification state. A legacy AI
 * value receives an explicit pending acceptance when the editor verifies it.
 */
export function setGeneratedTranslation<T extends object>(
  row: T,
  field: string,
  generated: boolean,
  serializeMetadata = false,
): T {
  const data = row as Record<string, unknown>
  const metadata = data.translationProvenance as Record<string, unknown> | undefined
  const raw = metadata?.[field]
  let decoded = raw
  try {
    if (typeof raw === 'string') decoded = JSON.parse(raw)
  } catch {
    decoded = undefined
  }
  const parsed = TranslationProvenanceSchema.valueType.safeParse(decoded)
  const value = data[field]
  // Preserve publication and the original receipt when verifying an accepted translation.
  const acceptance =
    parsed.success && parsed.data.acceptedValue === value
      ? { ...parsed.data, humanVerified: !generated }
      : !generated &&
          isGeneratedTranslation(row, field) &&
          typeof value === 'string' &&
          value.trim()
        ? {
            origin: 'legacy-ai' as const,
            value,
            acceptedValue: value,
            humanVerified: true,
            acceptedBy: 'pending',
            acceptedAt: new Date().toISOString(),
          }
        : undefined
  if (!acceptance) return { ...row, [`${field}Gen`]: generated }
  return {
    ...row,
    [`${field}Gen`]: false,
    translationProvenance: {
      ...metadata,
      [field]:
        serializeMetadata || typeof raw === 'string'
          ? JSON.stringify(acceptance)
          : acceptance,
    },
  }
}
