/** Presentation record supplied by the content-locale catalogue; never a UI locale. */
export interface LocaleOption {
  tag: string
  autonym: string
  name: string
  aliases?: readonly string[]
}

export interface LocaleSelection {
  selectedLocales: string[]
  visibleLocales: string[]
}

/** A single atomic intent; the caller must pass accepted state back through props. */
export type LocaleChange = LocaleSelection &
  (
    | { action: 'add' | 'reveal' | 'toggle' | 'remove'; locale: string }
    | { action: 'reorder'; locale: string; from: number; to: number }
  )

export interface LocaleControlLabels {
  multilingual: string
  add: string
  search: string
  noResults: string
  close: string
  selected: string
  moveEarlier: (name: string) => string
  moveLater: (name: string) => string
  remove: (name: string) => string
  atLeastOne: string
  changed: (name: string, action: LocaleChange['action']) => string
  moved: (name: string, position: number, total: number) => string
}

export interface LocaleToolbarProps extends LocaleSelection {
  options: readonly LocaleOption[]
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onChange: (change: LocaleChange) => void
  disabled?: boolean
  /** Explicit edit-mode permission to add languages; presentation controls remain independent. */
  allowAdd: boolean
  /** Settings edit membership; Profile chips toggle visibility without removing values. */
  mode?: 'visibility' | 'membership'
  alwaysExpanded?: boolean
  labels?: LocaleControlLabels
  class?: string
}
