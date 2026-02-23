import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { eq } from 'drizzle-orm'

// DB
import { getHubFromDomain } from '$lib/api/services/hub'
import { hub } from '$lib/db/schema'

// I18N
import { getDatabaseWithoutAuth } from '$lib/api'
import type { HubI18nDB, HubOpts, Locale } from '$lib/types'

const getBaseManifest = async (code: string) => {
  try {
    return await import(`../../../lib/manifests/${code}.json`)
  } catch (e) {
    return null
  }
}

const getLocaleFromHeaders = (request: Request): Locale => {
  const acceptLanguage = request.headers.get('accept-language')
  if (!acceptLanguage) return 'en'

  const langs = acceptLanguage.split(',').map(lang => {
    const [locale] = lang.trim().split(';')
    return locale
  })

  for (const lang of langs) {
    const locale = lang.toLowerCase()
    if (
      locale.startsWith('zh-hant') ||
      locale.startsWith('zh-tw') ||
      locale.startsWith('zh-hk')
    ) {
      return 'zh-hant'
    }
    if (locale.startsWith('zh-hans') || locale.startsWith('zh-cn')) {
      return 'zh-hans'
    }
    if (locale.startsWith('en')) {
      return 'en'
    }
  }

  return 'en'
}

export const GET: RequestHandler = async ({ url, request, platform }) => {
  const hubOpts: Partial<HubOpts> = getHubFromDomain(
    url.hostname,
    platform?.env?.PUBLIC_HUB_CODE,
  )

  if (!hubOpts.code) return error(404, 'Hub not found')

  const locale = getLocaleFromHeaders(request) as Locale
  let i18nData: Partial<HubI18nDB>
  let baseManifest: any
  let domain: string | null

  if (hubOpts.isCore) {
    baseManifest = await getBaseManifest(hubOpts.code)
    if (!baseManifest) return error(404, `Manifest for hub "${hubOpts.code}" not found`)
    i18nData = hubOpts.i18n![locale]!
    domain = hubOpts.domain!
  } else {
    const { db } = await getDatabaseWithoutAuth(platform)
    const hubDb = await db.query.hub.findFirst({
      with: { i18n: true },
      where: eq(hub.code, hubOpts.code),
    })
    if (!hubDb) return error(404, 'Hub not found')
    baseManifest = await getBaseManifest(hubDb.code!)
    if (!baseManifest) return error(404, `Manifest for hub "${hubDb.code}" not found`)
    i18nData =
      hubDb.i18n?.find(i => i.locale === locale) ||
      (hubDb.i18n?.find(i => i.locale === 'en') as Partial<HubI18nDB>)
    domain = hubDb.domain
  }

  const manifest = {
    ...baseManifest,
    name: i18nData?.name || 'HYPE',
    short_name: i18nData?.nameShort || 'HYPE',
    lang: locale,
    description: i18nData?.description || 'A HYPE.HK Hub',
    start_url: domain ? `https://${domain}` : '/',
  }

  // Create a clean manifest object without the default property
  const cleanManifest = { ...manifest }
  delete cleanManifest.default

  const headers = {
    'Content-Type': 'application/manifest+json',
    'Cache-Control': 'public, max-age=600',
  }

  return new Response(JSON.stringify(cleanManifest), { headers })
}
