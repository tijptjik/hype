import type { z } from 'zod'
import type { FormIssueLike, Id, Locale, LocaleKey } from '$lib/types'
import type {
  ProjectPropertyFormData,
  PropertyAdminProfileAPI,
  PropertyDetailProfileAPI,
  PropertyI18nRecord,
  PropertyI18nRecordCreate,
  PropertyI18nRecordUpdate,
  PropertyRecord,
  PropertyRecordCreate,
  PropertyRecordRaw,
  PropertyRecordUpdate,
  PropertyValueAdminProfileAPI,
  PropertyValueDetailProfileAPI,
  PropertyValueI18nRecord,
  PropertyValueI18nRecordCreate,
  PropertyValueI18nRecordUpdate,
  PropertyValueRawRecord,
  PropertyValueRecord,
  PropertyValueRecordCreate,
  PropertyValueRecordUpdate,
} from '$lib/db/zod/schema/property'

export type PropertyDB = z.infer<typeof PropertyRecord>
export type PropertyDBNew = z.infer<typeof PropertyRecordCreate>
export type PropertyDBPartial = z.infer<typeof PropertyRecordUpdate>
export type PropertyDBRaw = z.infer<typeof PropertyRecordRaw>

export type Property = z.infer<typeof PropertyDetailProfileAPI>
export type PropertyAdminProfile = z.infer<typeof PropertyAdminProfileAPI>
export type PropertyNew = PropertyAdminProfile
export type PropertyPartial = Partial<PropertyAdminProfile>
export type ProjectPropertyForm = z.infer<typeof ProjectPropertyFormData>
export type PropertyFormData = {
  id?: Id
  properties?: Property[]
}
export type PropertyDiscriminator = 'classifier' | 'specifier'
export type WritableI18nRecord = Record<string, Record<string, unknown>>
export type PropertyTranslationOrigin =
  | { type: 'label' | 'placeholder' }
  | { type: 'value'; valueId: Id }

export type FormFieldCardBodyProps = {
  property: Property
  propertyIndex: number
  sectionRank: number
  propertyFields?: unknown
  allIssues?: FormIssueLike[]
  locales: LocaleKey[]
  classifierComponents: readonly string[]
  specifierComponents: readonly string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  isEditing?: boolean
  onUpdateBase: (
    propertyId: Id,
    key: 'key' | 'component' | 'min' | 'max' | 'isTranslatable' | 'isDefaultEnabled',
    value: string | number | null | boolean,
  ) => void
  onUpdateI18n: (
    propertyId: Id,
    locale: Locale,
    key: 'label' | 'placeholder' | 'labelGen' | 'placeholderGen',
    value: string | boolean,
  ) => void
  onAddValue: (propertyId: Id) => void
  onSortValuesAlphabetically: (propertyId: Id, locale: Locale) => void
  onRemoveValue: (propertyId: Id, valueId: Id) => void
  onMoveValue: (propertyId: Id, valueId: Id, targetIndex: number) => void
  removeMode?: boolean
  onUpdateValue: (propertyId: Id, valueId: Id, key: 'value', value: string) => void
  onUpdateValueI18n: (
    propertyId: Id,
    valueId: Id,
    locale: Locale,
    key: 'value',
    value: string,
  ) => void
  onTranslateLocale: (
    propertyId: Id,
    sourceLocale: Locale,
    targetLocale: Locale,
  ) => Promise<boolean | void>
  onResetLocale: (propertyId: Id, targetLocale: Locale) => void | Promise<void>
  onLayoutMutationStart?: () => void
}

export type PropertyI18nDB = z.infer<typeof PropertyI18nRecord>
export type PropertyI18nNew = z.infer<typeof PropertyI18nRecordCreate>
export type PropertyI18nPartial = z.infer<typeof PropertyI18nRecordUpdate>

export type PropertyValueDB = z.infer<typeof PropertyValueRecord>
export type PropertyValueDBRaw = z.infer<typeof PropertyValueRawRecord>
export type PropertyValueNewDB = z.infer<typeof PropertyValueRecordCreate>
export type PropertyValuePartialDB = z.infer<typeof PropertyValueRecordUpdate>

export type PropertyValueI18nDB = z.infer<typeof PropertyValueI18nRecord>
export type PropertyValueI18nNew = z.infer<typeof PropertyValueI18nRecordCreate>
export type PropertyValueI18nPartial = z.infer<typeof PropertyValueI18nRecordUpdate>

export type PropertyValue = z.infer<typeof PropertyValueDetailProfileAPI>
export type PropertyValueAdminProfile = z.infer<typeof PropertyValueAdminProfileAPI>
export type PropertyValueNew = PropertyValueAdminProfile
export type PropertyValuePartial = Partial<PropertyValueAdminProfile>
