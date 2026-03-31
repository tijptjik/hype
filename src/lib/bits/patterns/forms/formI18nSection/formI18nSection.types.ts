import type { Locale, LocaleKey } from '$lib/types'
import type {
  SectionHeaderAction,
  SectionHeaderFlag,
  SectionHeaderTrigger,
} from '$lib/bits/custom/form/sectionHeader.types'
import type { Snippet } from 'svelte'

export interface FormI18nSectionProps {
  title?: string
  subtitle?: string
  preferredLocale?: LocaleKey
  locales?: LocaleKey[]
  class?: string
  gridClass?: string
  cardClass?: string
  localeCodeClass?: string
  onTranslate?: (
    sourceLocale: Locale,
    targetLocale: Locale,
    sectionKey?: string,
  ) => Promise<void | boolean>
  onResetLocale?: (targetLocale: Locale, sectionKey?: string) => void | Promise<void>
  sectionKey?: string
  isEditing?: boolean
  headerActions?: Snippet
  flags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  left?: Snippet
  center?: Snippet
  right?: Snippet
  children?: Snippet<[LocaleKey]>
  footer?: Snippet<[LocaleKey]>
}

export interface FormI18nHeaderProps {
  title?: string
  subtitle?: string
  headerActions?: Snippet
  flags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  left?: Snippet
  center?: Snippet
  right?: Snippet
}

export interface FormSectionProps {
  locale?: LocaleKey
  cardClass?: string
  contentClass?: string
  footerClass?: string
  localeCodeClass?: string
  onTranslate?: (
    sourceLocale: Locale,
    targetLocale: Locale,
    sectionKey?: string,
  ) => Promise<void | boolean>
  onResetLocale?: (targetLocale: Locale, sectionKey?: string) => void | Promise<void>
  sectionKey?: string
  isEditing?: boolean
  showTranslationBar?: boolean
  children?: Snippet | Snippet<[LocaleKey]>
  footer?: Snippet | Snippet<[LocaleKey]>
}
