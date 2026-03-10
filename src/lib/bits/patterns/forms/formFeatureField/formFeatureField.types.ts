import type { Property } from '$lib/db/zod/schema/property.types'

export type FormFeatureFieldProps = {
  property: Property
  localeKey: 'en' | 'zhHans' | 'zhHant'
  value?: string | null
  checked?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string | boolean) => void
}
