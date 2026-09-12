import type { ThemeDefinition } from '$lib/themes/themes.types'

export type ThemeOptionProps = {
  theme: ThemeDefinition
  selected: boolean
  name: string
  onSelect: () => void
}
