// TYPES
import type { TitleEnvironmentLabel } from '#lib/bits/patterns/panels/panel.types.js'

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

/** Append the current admin resource to the shared application/environment title.
 * @param title Existing shared title, including its environment prefix.
 * @param pathname Current route path. @returns Shared title with an admin resource suffix.
 */
export const resolveAdminTitle = (title: string, pathname: string): string => {
  const [, area, section] = pathname.split('/')
  if (area !== 'admin') return title
  const labels: Record<string, string> = {
    fieldresearch: 'Field research',
    import: 'Import',
    catalogue: 'Catalogue',
    features: 'Features',
    locations: 'Locations',
    organisations: 'Organisations',
    projects: 'Projects',
    layers: 'Layers',
    hubs: 'Hubs',
    users: 'Users',
    tasks: 'Tasks',
    templates: 'Templates',
    docs: 'Docs',
    analytics: 'Analytics',
    messaging: 'Messaging',
    whatsapp: 'WhatsApp',
    styles: 'Styles',
  }
  const resource = section ? (labels[section] ?? section.replaceAll('-', ' ')) : 'Admin'
  return `${title} - ${resource}`
}
