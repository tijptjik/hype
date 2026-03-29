// BITS
import type { FormFacetNavAction } from '$lib/bits/patterns/forms/formFacetNav'
import type { FeatureFieldSectionItem } from '$lib/bits/patterns/forms/formFeatureFieldsSection'
// TYPES
import type { FeatureFormInput } from '$lib/db/zod/schema/feature.types'
import type { Locale, LocaleKey } from '$lib/types'

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
