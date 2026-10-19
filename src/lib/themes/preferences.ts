// ZOD
import { z } from 'zod'
// THEME
import { THEMES } from './themes'
import { MAP_STYLE_KEYS } from '#lib/map/styles/registry.js'
// TYPES
import type { ThemeId } from './themes.types'

/** Account-owned appearance preferences; effective layer/project styles are not saved here. */
export const ThemePreferencesSchema = z.object({
  uiTheme: z.enum(THEMES.map(theme => theme.id) as [ThemeId, ...ThemeId[]]),
  mapStyle: z.enum(MAP_STYLE_KEYS).nullable(),
  syncUiAndMap: z.boolean().default(true),
  useActiveMapStyle: z.boolean().default(true),
})

export type ThemePreferences = z.infer<typeof ThemePreferencesSchema>
