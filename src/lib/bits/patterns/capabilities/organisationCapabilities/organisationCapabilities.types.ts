import type { CapabilityI18nRoot, CapabilityKey } from '#lib/capabilities.types.js'
import type { Locale, LocaleKey } from '#lib/types.js'

export type CapabilitySearchOption = {
  id: CapabilityKey
  key: CapabilityKey
  i18n: CapabilityI18nRoot
}

type CapabilityLabelField = {
  as: (type: 'text') => Record<string, unknown>
  issues: () => string[]
}

export type CapabilityFormFields = Partial<
  Record<
    CapabilityKey,
    {
      i18n?: Partial<Record<LocaleKey, CapabilityLabelField>>
    }
  >
>

export interface OrganisationCapabilitiesProps {
  selectedCapabilityKeys: CapabilityKey[]
  capabilitySearchOptions: CapabilitySearchOption[]
  selectedCapabilityIds: string[]
  currentLocaleKey: LocaleKey
  locales: LocaleKey[]
  isEditing: boolean
  isArchived?: boolean
  resetVersion?: number
  capabilityLabelsByKey: Partial<Record<CapabilityKey, CapabilityI18nRoot>>
  formCapabilityFields: CapabilityFormFields
  emptyCapabilitiesInputAttrs?: Record<string, unknown>
  shouldSubmitEmptyCapabilities?: boolean
  capabilityIssues?: string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  getCapabilityDisplayLabel: (key: CapabilityKey) => string
  onAddCapability: (option: CapabilitySearchOption) => void
  onRemoveCapability: (key: CapabilityKey) => void
  onEnterEditMode: () => void
  onTranslate?: (source: Locale, target: Locale) => Promise<boolean | void>
  onResetLocale?: (target: Locale) => void
}

export interface OrganisationCapabilitiesSearchProps {
  isEditing: boolean
  capabilitySearchOptions: CapabilitySearchOption[]
  selectedCapabilityIds: string[]
  currentLocaleKey: LocaleKey
  focusOnMount?: boolean
  onAddCapability: (option: CapabilitySearchOption) => void
}

export interface OrganisationCapabilitiesListProps {
  selectedCapabilityKeys: CapabilityKey[]
  isEditing: boolean
  getCapabilityDisplayLabel: (key: CapabilityKey) => string
  onRemoveCapability: (key: CapabilityKey) => void
}
