// TYPES
import type { CapabilityDefinitions, CapabilityKey } from '#lib/capabilities.types.js'
import type { LocaleKey } from '#lib/types.js'

/**
 * Translates populated source labels into empty target labels.
 * @param definitions - Capability values captured when translation starts.
 * @param source - Source locale key.
 * @param target - Destination locale key.
 * @param translate - Translation transport supplied by the caller.
 * @returns Translated values keyed by capability, without mutating the form.
 */
export async function translateCapabilityLabels(
  definitions: CapabilityDefinitions,
  source: LocaleKey,
  target: LocaleKey,
  translate: (
    source: LocaleKey,
    target: LocaleKey,
    texts: string[],
  ) => Promise<string[]>,
): Promise<Partial<Record<CapabilityKey, string>>> {
  if (source === target) return {}
  // Preserve existing translations and omit blank source strings from the request.
  const keys = (Object.keys(definitions) as CapabilityKey[]).filter(
    key =>
      definitions[key]?.i18n?.[source]?.trim() &&
      !definitions[key]?.i18n?.[target]?.trim(),
  )
  if (!keys.length) return {}
  const values = await translate(
    source,
    target,
    keys.map(key => definitions[key]?.i18n?.[source] ?? ''),
  )
  return Object.fromEntries(
    keys.flatMap((key, index) => (values[index]?.trim() ? [[key, values[index]]] : [])),
  )
}
