export type ImportSearchBoxSize = 'sm' | 'md'

export type ImportSearchBoxDropdown = 'inline' | 'floating'

export type ImportSearchBoxTone = 'primary' | 'success'

export type ImportSearchBoxItem<TValue = unknown> = {
  id: string
  title: string
  subtitle?: string | null
  image?: string | null
  fallback?: string
  value: TValue
}

export type ImportSearchBoxProps = {
  id: string
  value?: string
  results?: ImportSearchBoxItem[]
  label?: string
  ariaLabel: string
  placeholder: string
  size?: ImportSearchBoxSize
  dropdown?: ImportSearchBoxDropdown
  searchFor?: string
  inputClass?: string
  tone?: ImportSearchBoxTone
  onInput?: (value: string, event: Event) => void | Promise<void>
  onFocus?: (event: FocusEvent) => void
  onSelect: (item: ImportSearchBoxItem, event: MouseEvent) => void
  onInputKeydown?: (event: KeyboardEvent) => void
  onResultKeydown?: (
    event: KeyboardEvent,
    item: ImportSearchBoxItem,
    index: number,
  ) => void
}
