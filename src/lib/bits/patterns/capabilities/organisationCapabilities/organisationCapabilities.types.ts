import type { CapabilityI18nRoot, CapabilityKey } from '#lib/capabilities.types.js'
import type { LocaleKey } from '#lib/types.js'
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'

export type CapabilitySearchOption = {
  id: CapabilityKey
  key: CapabilityKey
  i18n: CapabilityI18nRoot
}

type CapabilityLabelField = {
  as: (type: 'text') => Record<string, unknown>
  set: (value: string) => unknown
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}

export type CapabilityFormFields = Partial<
  Record<
    CapabilityKey,
    {
      i18n?: Partial<Record<string, CapabilityLabelField>>
    }
  >
>

export interface OrganisationCapabilitiesProps {
  users?: import('svelte').Snippet
  selectedCapabilityKeys: CapabilityKey[]
  capabilitySearchOptions: CapabilitySearchOption[]
  selectedCapabilityIds: string[]
  currentLocaleKey: LocaleKey
  locales: LocaleKey[]
  capabilityLocales?: string[]
  isEditing: boolean
  isArchived?: boolean
  resetVersion?: number
  /** Shared presentation state with the organisation's other multilingual forms. */
  multilingual?: boolean
  localeSelection?: LocaleSelection | null
  capabilityLabelsByKey: Partial<Record<CapabilityKey, CapabilityI18nRoot>>
  formCapabilityFields: CapabilityFormFields
  emptyCapabilitiesInputAttrs?: Record<string, unknown>
  shouldSubmitEmptyCapabilities?: boolean
  capabilityIssues?: string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  getCapabilityDisplayLabel: (key: CapabilityKey) => string
  onAddCapability: (option: CapabilitySearchOption) => void
  onRemoveCapability: (key: CapabilityKey) => void
  onAddLocale?: (locale: string) => void
  onEnterEditMode: () => void
  onTranslate?: (
    source: string,
    target: string,
    capabilityKey?: CapabilityKey,
  ) => Promise<boolean | void>
  onResetLocale?: (target: string) => void
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
