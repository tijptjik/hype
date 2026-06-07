// TYPES
import type { TitleEnvironmentLabel } from '$lib/types'

const ENV_TITLE_PREFIX_PATTERN = /^\[(?:DEV|PREVIEW)\]\s*/

/**
 * Resolves the short environment label used to distinguish non-production tabs.
 *
 * @param environment Runtime environment from the Cloudflare platform binding.
 * @param isDev Whether the current runtime is Vite/SvelteKit dev mode.
 * @returns The title label for local/dev and preview deployments.
 */
export const getTitleEnvironmentLabel = (
  environment: string | undefined,
  isDev = import.meta.env.DEV,
): TitleEnvironmentLabel | undefined => {
  if (environment === 'preview') return 'ᴾᴿᴱⱽᴵᴱᵂ'
  if (isDev) return 'ᴰᴱⱽ'
  return undefined
}

/**
 * Resolves a document title with the current environment prefix.
 *
 * @param title The route or app title to display.
 * @param environmentLabel Optional non-production environment label.
 * @returns A normalized title with at most one environment prefix.
 */
export const resolveTitle = (
  title: string,
  environmentLabel: TitleEnvironmentLabel | undefined,
): string => {
  const normalizedTitle = title.replace(ENV_TITLE_PREFIX_PATTERN, '')
  return environmentLabel ? `${environmentLabel} ${normalizedTitle}` : normalizedTitle
}
