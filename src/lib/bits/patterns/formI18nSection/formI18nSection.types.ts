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
  sectionFlags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  left?: Snippet
  right?: Snippet
}

export interface FormI18nLocaleCardProps {
  locale: Locale
  cardClass?: string
  localeCodeClass?: string
  onTranslate?: (sourceLocale: Locale, targetLocale: Locale) => Promise<void>
  isEditing?: boolean
  children?: Snippet<[Locale]>
  footer?: Snippet<[Locale]>
}
