/** Minimal shape shared by public collection rows and full feature cards. */
export type PresentationFeature = {
  layerId?: string
  properties?: ReadonlyArray<{
    value?: string | null
    property?: { key?: string } | null
    propertyValue?: { value?: string | null; i18n?: unknown } | null
  }> | null
}

/**
 * Reads a stable property value, falling back to the classifier's English label.
 * @param feature Hydrated feature properties.
 * @param key Property key, not its opaque database ID.
 * @returns Text for presentation, or an empty string if the field is absent.
 */
export function presentationProperty(
  feature: PresentationFeature,
  key: string,
): string {
  const row = feature.properties?.find(row => row.property?.key === key)
  if (!row) return ''
  if (row.value) return row.value
  if (row.propertyValue?.value) return row.propertyValue.value
  const locales = row.propertyValue?.i18n
  if (locales && typeof locales === 'object' && 'en' in locales) {
    const english = locales.en
    if (
      english &&
      typeof english === 'object' &&
      'value' in english &&
      typeof english.value === 'string'
    )
      return english.value
  }
  return ''
}
