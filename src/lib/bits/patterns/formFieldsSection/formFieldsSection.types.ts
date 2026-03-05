import type { Property, Id, Locale } from '$lib/types'
import type { Snippet } from 'svelte'
import type { DragDropOptions } from '@thisux/sveltednd'

export interface FormFieldsSectionActionHandlers {
  add: (event: Event) => void | Promise<void>
  remove: (event: Event, propertyId: Id) => void | Promise<void>
  increaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  decreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
}

export interface FormFieldsSectionProps {
  items: Property[]
  title?: string
  description?: string
  issues?: string[]
  actions: FormFieldsSectionActionHandlers
  issueItemIds?: Id[]
  isEditing?: boolean
  canEdit?: boolean
  removeMode?: boolean
  onRemoveModeChange?: (value: boolean) => void
  card?: FormFieldsSectionCardConfig
  class?: string
}

export interface FormFieldsSectionActionsProps {
  actions: FormFieldsSectionActionHandlers
  isEditing?: boolean
  removeMode?: boolean
  onRemoveModeChange?: (value: boolean) => void
  itemCount?: number
}

export interface FormFieldsSectionWrapperProps {
  items: Property[]
  issueItemIds?: Id[]
  isEditing?: boolean
  canEdit?: boolean
  onAdd?: (event: Event) => void | Promise<void>
  card?: FormFieldsSectionCardConfig
}

export interface FormFieldsSectionItemProps {
  property: Property
  index: number
  totalItems: number
  issueItemIds?: Id[]
  card?: FormFieldsSectionCardConfig
}

export interface FormFieldsSectionCardConfig extends FormFieldCardCallbacks {
  locales: Locale[]
  classifierComponents: readonly string[]
  specifierComponents: readonly string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  isEditing?: boolean
  removeMode: boolean
  getPropertyIndex: (propertyId: Id, sectionIndex: number) => number
  getPropertyFields?: (propertyId: Id, propertyIndex: number) => unknown
}

type ValueI18nField = 'value'
type PropertyI18nField = 'label' | 'placeholder' | 'labelGen' | 'placeholderGen'

export interface FormFieldCardCallbacks {
  onIncreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onDecreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onRemove: (event: Event, propertyId: Id) => void | Promise<void>
  onUpdateBase: (
    propertyId: Id,
    key: 'key' | 'component' | 'min' | 'max' | 'isTranslatable',
    value: string | number | null | boolean,
  ) => void
  onUpdateI18n: (
    propertyId: Id,
    locale: Locale,
    key: PropertyI18nField,
    value: string | boolean,
  ) => void
  onAddValue: (propertyId: Id) => void
  onRemoveValue: (propertyId: Id, valueId: Id) => void
  onMoveValue: (propertyId: Id, valueId: Id, targetIndex: number) => void
  onUpdateValueI18n: (
    propertyId: Id,
    valueId: Id,
    locale: Locale,
    key: ValueI18nField,
    value: string,
  ) => void
  onTranslateLocale: (
    propertyId: Id,
    sourceLocale: Locale,
    targetLocale: Locale,
  ) => Promise<boolean | void>
  onResetLocale: (propertyId: Id, targetLocale: Locale) => void | Promise<void>
  removeMode?: boolean
}

export interface FormFieldCardProps extends FormFieldCardCallbacks {
  property: Property
  propertyIndex: number
  sectionRank: number
  propertyFields?: unknown
  totalItems: number
  removeMode: boolean
  locales: Locale[]
  classifierComponents: readonly string[]
  specifierComponents: readonly string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  isEditing?: boolean
}

export interface FormFieldPropertyValueItemProps {
  isEditing?: boolean
  optionRemoveMode?: boolean
  valueId: string
  propertyId: string
  onRemove: (propertyId: string, valueId: string) => void
  draggableConfig: DragDropOptions<{ id: string }> & { interactive?: string[] }
  droppableConfig: DragDropOptions<{ id: string }>
  content: Snippet
}
