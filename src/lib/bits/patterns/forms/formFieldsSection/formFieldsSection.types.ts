import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
import type { Id } from '#lib/types.js'
import type {
  Property,
  PropertyTranslationOrigin,
} from '#lib/db/zod/schema/property.types.js'
import type { Snippet } from 'svelte'
import type { DragDropOptions, DraggableOptions } from '@thisux/sveltednd'
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
  icon?: Component
  keepHeader?: boolean
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
  /** Shared multilingual presentation for every section in the owning form. */
  multilingual?: boolean
  /** Form-owned language order and visibility shared across tabs. */
  localeSelection?: LocaleSelection | null
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
  /** Section-owned language presentation; stored translations are unchanged. */
  multilingual?: boolean
  visibleLocales?: string[]
  locales: string[]
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
      | 'dateResolution'
      | 'timeMaxHour'
      | 'dataType'
      | 'cardinality'
      | 'presentation'
      | 'audience'
      | 'isDefaultEnabled'
      | 'isEnabled',
    value: string | number | null | boolean,
  ) => void
  onUpdateI18n: (
    propertyId: Id,
    locale: string,
    key: PropertyI18nField,
    value: string | boolean,
  ) => void
  onAddValue: (propertyId: Id) => void
  onSortValuesAlphabetically: (propertyId: Id, locale: string) => void
  onRemoveValue: (propertyId: Id, valueId: Id) => void
  onMoveValue: (propertyId: Id, valueId: Id, targetIndex: number) => void
  onUpdateValueI18n: (
    propertyId: Id,
    valueId: Id,
    locale: string,
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
    sourceLocale: string,
    targetLocale: string,
    origin?: PropertyTranslationOrigin,
  ) => Promise<boolean | void>
  onResetLocale: (propertyId: Id, targetLocale: string) => void | Promise<void>
  removeMode?: boolean
}

export interface FormFieldCardProps extends FormFieldCardCallbacks {
  multilingual?: boolean
  visibleLocales?: string[]
  property: Property
  propertyIndex: number
  sectionRank: number
  moveWindowSize?: number
  isMoveLocked?: boolean
  propertyFields?: unknown
  allIssues?: Array<{ message: string; path?: Array<string | number> }>
  totalItems: number
  removeMode: boolean
  locales: string[]
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
  class?: string
  isEditing?: boolean
  optionRemoveMode?: boolean
  isPlaceholder?: boolean
  hasIssues?: boolean
  valueId: string
  propertyId: string
  onRemove: (propertyId: string, valueId: string) => void
  draggableConfig: DraggableOptions<{ id: string }>
  droppableConfig: DragDropOptions<{ id: string }>
  content: Snippet
}
