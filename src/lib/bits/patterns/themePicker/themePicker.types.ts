import type { ThemeId } from '$lib/themes/themes.types'

export type ThemePickerProps = {
  value: ThemeId
  onSelect: (theme: ThemeId) => void
  class?: string
  label?: string
}
