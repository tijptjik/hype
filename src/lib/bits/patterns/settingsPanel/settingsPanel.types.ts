// TYPES
import type { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import type { useLanguageSettingsModel } from '#lib/adapters/panels/useLanguageSettingsModel.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { ThemeId } from '#lib/themes/themes.types.js'

/** Read-only surfaces offer a primary language without account preferences. */
export type SimpleLanguageSettingsModel = Pick<
  ReturnType<typeof useLanguageSettingsModel>,
  'currentLocale' | 'currentLocaleKey' | 'pendingLocale' | 'handleLocaleChange'
> & { availableLocales?: import('#lib/types.js').Locale[] }

/** Restricted settings use the same renderer without constructing account adapters. */
export type EmbedSettingsModel = {
  mode: 'embed'
  panel: PanelProps
  open: boolean
  onClose: () => void
  language: SimpleLanguageSettingsModel
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
}
export type SettingsPanelModel =
  | ReturnType<typeof useSettingsPanelModel>
  | EmbedSettingsModel
