// ZOD
import { z } from 'zod'
// THEME
import { ThemePreferencesSchema } from '#lib/themes/preferences.js'

const UserPreferencesSchema = z
  .object({
    fallbackLocales: z.array(z.string()).nullish(),
    allowMachineTranslation: z.boolean().nullish(),
    preferFallbackInCurrentLocale: z.boolean().nullish(),
    isTranslateButtonVisible: z.boolean().nullish(),
    theme: ThemePreferencesSchema.nullish().catch(undefined),
    profileContributions: z
      .object({
        observePrisms: z.boolean().optional(),
        showAll: z.boolean().optional(),
      })
      .nullish(),
    admin: z
      .object({
        isAdminMapCollapsed: z.boolean().optional(),
        isPrimaryPanelCollapsed: z.boolean().optional(),
        isPrimaryPanelAutoHide: z.boolean().optional(),
      })
      .nullish(),
  })
  .prefault({
    fallbackLocales: ['en', 'zh-hant'],
    allowMachineTranslation: false,
    preferFallbackInCurrentLocale: false,
    isTranslateButtonVisible: true,
    admin: {},
  })

const UserExperimentalSchema = z
  .object({
    contributorMode: z.boolean().nullish(),
    noLabelsMode: z.boolean().nullish(),
  })
  .prefault({
    contributorMode: false,
    noLabelsMode: false,
  })
  .nullish()

/**
 * Decode persisted JSON without changing the fallback policy for malformed input.
 * @param schema Validator for the decoded value.
 * @returns A preprocessing schema with the supplied output contract.
 */
const JsonStringWithFallback = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(value => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }, schema)

export const UserSettingsSchema = z.object({
  preferences: JsonStringWithFallback(UserPreferencesSchema),
  experimental: JsonStringWithFallback(UserExperimentalSchema),
})
