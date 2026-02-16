import type { Locale } from '$lib/types'
import type {
  SectionHeaderAction,
  SectionHeaderFormFlag,
  SectionHeaderInfoTrigger,
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
  headerActions?: Snippet
  formFlags?: SectionHeaderFormFlag[]
  actions?: SectionHeaderAction[]
  infoTrigger?: SectionHeaderInfoTrigger | SectionHeaderInfoTrigger[]
  left?: Snippet
  right?: Snippet
  children?: Snippet<[Locale]>
  footer?: Snippet<[Locale]>
}
