// I18N
import { m } from '$lib/i18n'
// TYPES
import type {
  CapabilityDefinitions,
  CapabilityI18nRoot,
  CapabilityKey,
  ProjectCapabilities,
  ProjectRoleCapabilities,
} from '$lib/types'

export const CAPABILITY_KEYS = [
  'manageBakeries',
  'manageVolunteers',
  'manageDropOffs',
] as const satisfies readonly CapabilityKey[]

export const CAPABILITY_I18N_BY_KEY: Record<CapabilityKey, CapabilityI18nRoot> = {
  manageBakeries: {
    en: m.admin__capability_manage_bakeries({}, { locale: 'en' }),
    zhHans: m.admin__capability_manage_bakeries({}, { locale: 'zh-hans' }),
    zhHant: m.admin__capability_manage_bakeries({}, { locale: 'zh-hant' }),
  },
  manageVolunteers: {
    en: m.admin__capability_manage_volunteers({}, { locale: 'en' }),
    zhHans: m.admin__capability_manage_volunteers({}, { locale: 'zh-hans' }),
    zhHant: m.admin__capability_manage_volunteers({}, { locale: 'zh-hant' }),
  },
  manageDropOffs: {
    en: m.admin__capability_manage_dropoffs({}, { locale: 'en' }),
    zhHans: m.admin__capability_manage_dropoffs({}, { locale: 'zh-hans' }),
    zhHant: m.admin__capability_manage_dropoffs({}, { locale: 'zh-hant' }),
  },
}

export function isProjectCapabilityKey(value: string): value is CapabilityKey {
  return CAPABILITY_KEYS.includes(value as CapabilityKey)
}

export function getCapabilityLabel(
  key: CapabilityKey,
  locale: keyof CapabilityI18nRoot,
): string {
  const labels = CAPABILITY_I18N_BY_KEY[key]
  return labels[locale] ?? labels.en ?? key
}

export function getCapabilityKeysFromDefinitions(
  definitions: CapabilityDefinitions | null | undefined,
): CapabilityKey[] {
  if (!definitions || typeof definitions !== 'object') return []
  return CAPABILITY_KEYS.filter(key => definitions[key] != null)
}

export function normalizeProjectCapabilities(value: unknown): ProjectCapabilities {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    manageBakeries: source.manageBakeries === true,
    manageVolunteers: source.manageVolunteers === true,
    manageDropOffs: source.manageDropOffs === true,
  }
}

export function normalizeProjectRoleCapabilities(
  value: unknown,
): ProjectRoleCapabilities {
  return normalizeProjectCapabilities(value)
}
