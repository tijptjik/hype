// TYPES
import type { DisplayTemplateDefinition } from './registry'

/** Inspection-only definitions of built-in Feature and Location naming defaults. */
export type SystemDisplayTemplate = DisplayTemplateDefinition & {
  id: string
  system: true
  organisationId: null
  version: 0
}

// These entries describe built-in naming defaults, not assignable registry versions.
export const SYSTEM_DISPLAY_TEMPLATES: SystemDisplayTemplate[] = [
  {
    id: 'system:feature-name',
    system: true,
    organisationId: null,
    version: 0,
    name: 'Feature name',
    code: 'system-feature-name',
    target: 'feature',
    locales: {
      en: '{{ feature.name }}',
      'zh-Hant': '{{ feature.name }}',
      'zh-Hans': '{{ feature.name }}',
    },
  },
  {
    id: 'system:location-name',
    system: true,
    organisationId: null,
    version: 0,
    name: 'Location name',
    code: 'system-location-name',
    target: 'location',
    locales: {
      en: '{{ source.name }}',
      'zh-Hant': '{{ source.name }}',
      'zh-Hans': '{{ source.name }}',
    },
  },
  {
    id: 'system:location-brand-branch',
    system: true,
    organisationId: null,
    version: 0,
    name: 'Location brand and branch',
    code: 'system-location-brand-branch',
    target: 'location',
    locales: {
      en: '{{ pair(brand.name, branch, " - ") ?? brand.name ?? source.name }}',
      'zh-Hant': '{{ pair(brand.name, branch, " - ") ?? brand.name ?? source.name }}',
      'zh-Hans': '{{ pair(brand.name, branch, " - ") ?? brand.name ?? source.name }}',
    },
  },
]
