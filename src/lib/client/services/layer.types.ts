import type { Component } from 'svelte'
import type {
  LayerFormInput,
  LayerFormLocaleInput,
} from '$lib/db/zod/schema/layer.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { LocaleKey } from '$lib/types'

export type LayerFormLocale = LayerFormLocaleInput
export type LayerFormPayload = LayerFormInput['data']
export type LayerI18nRecord = Partial<Record<LocaleKey, unknown>>
export type LayerI18nPatch = Partial<Record<LocaleKey, Partial<LayerFormLocale>>>

export type LayerParentProjectFormData = {
  projectId?: string
  organisationId?: string
  i18n?: Record<string, unknown>
}

export type LayerFormPropertyRow = NonNullable<LayerFormPayload['properties']>[number]

export type ResolvedLayerProperty = Property & { rank?: number }

export type LayerEditorPermissions = {
  canEditI18n: boolean
  canEditFields: boolean
  canPublish: boolean
  canArchive: boolean
}

export type LayerPropertyRow = {
  index: number
  propertyId: string
  isVisible: boolean
  isUserContributable: boolean
  type: string
  name: string
  rank: number
  scopeLabel: 'global' | 'hub' | 'org' | 'project'
  scopeTone: 'global' | 'hub' | 'org' | 'project'
  typeIconComponent: Component
  typeIconTitle: string
}
