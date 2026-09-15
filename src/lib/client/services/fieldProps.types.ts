// TYPES
import type { Id, LocaleExtended } from '$lib/types'

// ELEMENTS

type InputProps = {
  id: Id
  value: string
  isGenAI: boolean
  placeholder?: string
  locale: LocaleExtended
  isTranslated?: boolean
  inputType?: 'text' | 'number' | 'email'
  onchange: (event: Event) => void
}

type SelectProps = {
  id: Id
  value: string
  values: readonly string[] | { readonly value: string; readonly id: string }[]
  isComplex?: boolean
}

type DisplayFieldProps = {
  label: string
  value: unknown
  justify?: 'start' | 'end'
  gridCell?: boolean
}
