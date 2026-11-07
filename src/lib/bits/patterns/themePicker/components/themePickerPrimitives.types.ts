import type { ThemeDefinition } from '#lib/themes/themes.types.js'

export type ThemeOptionProps = {
  theme: ThemeDefinition
  compact?: boolean
  selected: boolean
  name: string
  onSelect: () => void
}
