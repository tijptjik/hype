// TYPES

// Labels use the shared content-language contract, independently of UI locales.
export type CapabilityI18nRoot = Partial<Record<string, string>>

export type CapabilityKey = 'manageBakeries' | 'manageVolunteers' | 'manageDropOffs'

export type CapabilityDefinition = {
  i18n?: CapabilityI18nRoot
}

export type CapabilityDefinitions = Partial<Record<CapabilityKey, CapabilityDefinition>>
