import type { Property } from '$lib/db/zod/schema/property.types'

export type FeatureFieldSectionItem = {
  property: Property
  value?: string | null
  checked?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string | boolean) => void
}

export type FormFeatureFieldsSectionProps = {
  title: string
  subtitle?: string
  localeKey: 'en' | 'zhHans' | 'zhHant'
  items: FeatureFieldSectionItem[]
  class?: string
}
