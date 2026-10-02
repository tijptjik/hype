import { getLocaleKey } from '#lib/i18n.js'
import { getTitleEnvironmentLabel, resolveTitle } from '#lib/navigation/title.js'
// TYPES
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { TitleEnvironmentLabel } from '#lib/bits/patterns/panels/panel.types.js'

export const ssr = true
export const prerender = false
// See https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/
export const trailingSlash = 'never'

export async function load({ data }) {
  const hub = data.hub as HubOptsExtended
  const hubUserState = data.hubUserState ?? null
  const localeKey = getLocaleKey()
  const localizedHubI18n = hub.i18n?.[localeKey]
  const fallbackHubI18n = hub.i18n?.en ?? Object.values(hub.i18n ?? {})[0]
  const rawTitle = localizedHubI18n?.name ?? fallbackHubI18n?.name ?? ''
  const titleEnvironmentLabel =
    (data.titleEnvironmentLabel as TitleEnvironmentLabel | undefined) ??
    getTitleEnvironmentLabel(undefined)

  return {
    hub,
    hubUserState,
    title: resolveTitle(rawTitle, titleEnvironmentLabel),
    titleEnvironmentLabel,
    site_name: localizedHubI18n?.name ?? fallbackHubI18n?.name ?? '',
    site_description:
      localizedHubI18n?.description ?? fallbackHubI18n?.description ?? '',
  }
}
