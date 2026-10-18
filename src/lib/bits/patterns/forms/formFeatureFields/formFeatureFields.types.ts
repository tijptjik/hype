// BITS
import type { FormFacetNavAction } from '#lib/bits/patterns/forms/formFacetNav/index.js'
import type { FeatureFieldSectionItem } from '#lib/bits/patterns/forms/formFeatureFieldsSection/index.js'
// TYPES
import type { FeatureFormInput } from '#lib/db/zod/schema/feature.types.js'
import type { Locale, LocaleKey } from '#lib/types.js'

export type FormFeatureFieldsTranslatableItem = NonNullable<
  FeatureFormInput['data']['properties']
>[number]

export type FormFeatureFieldsProps = {
  localeKey: keyof FeatureFormInput['data']['i18n']
  locales: LocaleKey[]
  nonTranslatableItems: FeatureFieldSectionItem[]
  translatableSpecifierItems: FormFeatureFieldsTranslatableItem[]
  isEditing?: boolean
  previousAction?: FormFacetNavAction | null
  nextAction?: FormFacetNavAction | null
  onTranslate: (
    sourceLocale: Locale,
    targetLocale: Locale,
    sectionKey?: string,
  ) => Promise<boolean>
  onResetLocale: (targetLocale: Locale, sectionKey?: string) => void | Promise<void>
  onToggleGenAI: (
    propertyId: string,
    locale: keyof FeatureFormInput['data']['i18n'],
  ) => void
  onValueChange: (
    propertyId: string,
    locale: keyof FeatureFormInput['data']['i18n'],
    nextValue: string,
  ) => void
}
