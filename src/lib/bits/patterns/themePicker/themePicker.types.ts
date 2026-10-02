import type { ThemeId } from '#lib/themes/themes.types.js'

export type ThemePickerProps = {
  value: ThemeId
  onSelect: (theme: ThemeId) => void
  class?: string
  label?: string
}
