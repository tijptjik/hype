// TYPES
import type { FeatureRevisionContent } from './featureContent'

/**
 * Presents submitted text without manufacturing an accepted Feature identity.
 * @param content Immutable creation proposal content, when present.
 * @returns Locale-keyed display fields compatible with the regular translation reader.
 */
export function featureCreationPreview(content?: FeatureRevisionContent): {
  i18n: Record<
    string,
    {
      title: string
      titleGen: boolean
      description: string | null
      descriptionGen: boolean
      displayAddress: string | null
      displayAddressGen: boolean
    }
  >
} {
  return {
    i18n: Object.fromEntries(
      Object.entries(content?.translations ?? {}).map(([locale, text]) => [
        locale,
        {
          title: text.title.value,
          titleGen: text.title.generated,
          description: text.description.value,
          descriptionGen: text.description.generated,
          displayAddress: text.address.value,
          displayAddressGen: text.address.generated,
        },
      ]),
    ),
  }
}
