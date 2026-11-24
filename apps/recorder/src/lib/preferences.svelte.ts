export type RecorderTheme = 'breadline-light' | 'hype-dark'
export type RecorderLanguage = 'en'
export const preferences = $state<{ theme: RecorderTheme; language: RecorderLanguage }>(
  {
    theme: 'hype-dark',
    language: 'en',
  },
)

/** Restore the pre-paint preference state. @returns Nothing. */
export function initializePreferences(): void {
  preferences.theme =
    document.documentElement.dataset.theme === 'breadline-light'
      ? 'breadline-light'
      : 'hype-dark'
  document.documentElement.lang = preferences.language
}

/** Apply and persist this device's supported appearance and language.
 * @param theme Selected palette. @param language Supported interface language. @returns Nothing.
 * @remarks Storage restrictions must not prevent changing the current appearance.
 */
export function setPreferences(
  theme: RecorderTheme,
  language: RecorderLanguage = 'en',
): void {
  preferences.theme = theme
  preferences.language = language
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = language
  try {
    localStorage.setItem(
      'hype-recorder-preferences',
      JSON.stringify({ theme, language }),
    )
  } catch {
    /* Keep the in-memory choice when storage is unavailable. */
  }
}
