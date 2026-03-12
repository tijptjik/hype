import type { Id, Locale } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Snippet } from 'svelte'
import type { DragDropOptions } from '@thisux/sveltednd'
import type { Component } from 'svelte'

export interface FormFieldsSectionActionHandlers {
  add: (event: Event) => void | Promise<void>
  remove: (event: Event, propertyId: Id) => void | Promise<void>
  increaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  decreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
}

export interface FormFieldsSectionLoadingItem {
  id: Id
  presentation: 'full' | 'header'
  isCollapsed: boolean
}

export interface FormFieldsSectionProps {
  items: Property[]
  isLoading?: boolean
  loadingItems?: FormFieldsSectionLoadingItem[]
  title?: string
  description?: string
  issues?: string[]
  actions: FormFieldsSectionActionHandlers
  issueItemIds?: Id[]
  isEditing?: boolean
  canEdit?: boolean
  disableEmptyAdd?: boolean
  removeMode?: boolean
  onRemoveModeChange?: (value: boolean) => void
  layoutMutationVersion?: number
  card?: FormFieldsSectionCardConfig
  onVisibilityToggle?: (nextVisible: boolean, event: MouseEvent) => void
  isVisibilityOn?: boolean
  visibilityOnLabel?: string
  visibilityOffLabel?: string
  isItemVisible?: (property: Property) => boolean
  forceFlipDisabled?: boolean
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
  isLoading?: boolean
  loadingItems?: FormFieldsSectionLoadingItem[]
  issueItemIds?: Id[]
  isEditing?: boolean
  canEdit?: boolean
  disableEmptyAdd?: boolean
  onAdd?: (event: Event) => void | Promise<void>
  card?: FormFieldsSectionCardConfig
  collapsedAll?: boolean
  collapseAllVersion?: number
  flipDisabled?: boolean
  introItemId?: Id | null
  onIntroEnd?: (propertyId: Id) => void
  onCardCollapseToggle?: () => void
  onCollapseChange?: (
    propertyId: Id,
    collapsed: boolean,
    presentation: 'full' | 'header',
  ) => void
  isItemVisible?: (property: Property) => boolean
}

export interface FormFieldsSectionItemProps {
  property: Property
  index: number
  totalItems: number
  moveWindowSize?: number
  isMoveLocked?: boolean
  keepExpandedOnIntro?: boolean
  issueItemIds?: Id[]
  card?: FormFieldsSectionCardConfig
  collapsedAll?: boolean
  collapseAllVersion?: number
  onCardCollapseToggle?: () => void
  onCollapseChange?: (
    propertyId: Id,
    collapsed: boolean,
    presentation: 'full' | 'header',
  ) => void
}

export interface FormFieldsSectionCardConfig extends FormFieldCardCallbacks {
  locales: Locale[]
  classifierComponents: readonly string[]
  specifierComponents: readonly string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  allIssues?: Array<{ message: string; path?: Array<string | number> }>
  isEditing?: boolean
  removeMode: boolean
  getPropertyIndex: (propertyId: Id, sectionIndex: number) => number
  getPropertyFields?: (propertyId: Id, propertyIndex: number) => unknown
  resolveCardPresentation?: (property: Property) => 'full' | 'header'
  resolveTitleHref?: (property: Property) => string | null
  getMoveWindowSize?: (items: Property[]) => number
  isMoveLocked?: (property: Property) => boolean
  resolveSourceTag?: (property: Property) => {
    label?: string
    title?: string
    tone: 'global' | 'hub' | 'org' | 'project'
    iconComponent?: Component
  } | null
}

type ValueI18nField = 'value'
type PropertyI18nField = 'label' | 'placeholder' | 'labelGen' | 'placeholderGen'
type PropertyValueField = 'value'

export interface FormFieldCardCallbacks {
  onIncreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onDecreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onRemove: (event: Event, propertyId: Id) => void | Promise<void>
  onUpdateBase: (
    propertyId: Id,
    key:
      | 'key'
      | 'component'
      | 'min'
      | 'max'
      | 'isTranslatable'
      | 'isDefaultEnabled'
      | 'isEnabled',
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
  onUpdateValue: (
    propertyId: Id,
    valueId: Id,
    key: PropertyValueField,
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
  moveWindowSize?: number
  isMoveLocked?: boolean
  propertyFields?: unknown
  allIssues?: Array<{ message: string; path?: Array<string | number> }>
  totalItems: number
  removeMode: boolean
  locales: Locale[]
  classifierComponents: readonly string[]
  specifierComponents: readonly string[]
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  isEditing?: boolean
  presentation?: 'full' | 'header'
  titleHref?: string | null
  sourceTag?: {
    label?: string
    title?: string
    tone: 'global' | 'hub' | 'org' | 'project'
    iconComponent?: Component
  } | null
  collapsedAll?: boolean
  collapseAllVersion?: number
  keepExpandedOnIntro?: boolean
  onCollapseToggle?: () => void
  onCollapseChange?: (collapsed: boolean) => void
}

export interface FormFieldPropertyValueItemProps {
  isEditing?: boolean
  optionRemoveMode?: boolean
  isPlaceholder?: boolean
  hasIssues?: boolean
  valueId: string
  propertyId: string
  onRemove: (propertyId: string, valueId: string) => void
  draggableConfig: DragDropOptions<{ id: string }> & { interactive?: string[] }
  droppableConfig: DragDropOptions<{ id: string }>
  content: Snippet
}
