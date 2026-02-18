import type { Locale } from '$lib/types'
import type {
  SectionHeaderAction,
  SectionHeaderFlag,
  SectionHeaderTrigger,
} from '$lib/bits/custom/form/sectionHeader.types'
import type { Snippet } from 'svelte'

export interface FormI18nSectionProps {
  title?: string
  subtitle?: string
  preferredLocale?: Locale
  locales?: Locale[]
  class?: string
  gridClass?: string
  cardClass?: string
  localeCodeClass?: string
  onTranslate?: (sourceLocale: Locale, targetLocale: Locale) => Promise<void>
  onResetLocale?: (targetLocale: Locale) => void | Promise<void>
  isEditing?: boolean
  headerActions?: Snippet
  flags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  left?: Snippet
  right?: Snippet
  children?: Snippet<[Locale]>
  footer?: Snippet<[Locale]>
}

export interface FormI18nHeaderProps {
  title?: string
  subtitle?: string
  headerActions?: Snippet
  flags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  left?: Snippet
  right?: Snippet
}

export interface FormSectionProps {
  locale?: Locale
  cardClass?: string
  contentClass?: string
  footerClass?: string
  localeCodeClass?: string
  onTranslate?: (sourceLocale: Locale, targetLocale: Locale) => Promise<void>
  onResetLocale?: (targetLocale: Locale) => void | Promise<void>
  isEditing?: boolean
  showTranslationBar?: boolean
  children?: Snippet | Snippet<[Locale]>
  footer?: Snippet | Snippet<[Locale]>
}
