// TYPES

export type CapabilityI18nRoot = {
  en?: string
  zhHans?: string
  zhHant?: string
}

export type CapabilityKey = 'manageBakeries' | 'manageVolunteers' | 'manageDropOffs'

export type CapabilityDefinition = {
  i18n?: CapabilityI18nRoot
}

export type CapabilityDefinitions = Partial<Record<CapabilityKey, CapabilityDefinition>>
