import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// DB
import db from '$lib/db';
import { getHubByCode } from '$lib/db/services/hub';
import { getHubFromDomain } from '$lib/api/services/hub';

// I18N
import * as m from '$lib/paraglide/messages';
import { locales, type AvailableLanguageTag } from '$lib/paraglide/runtime';
import { getDatabaseWithoutAuth } from '$lib/api';

const getBaseManifest = async (code: string) => {
  try {
    return await import(`../../../lib/manifests/${code}.json`);
  } catch (e) {
    return null;
  }
};

const getLocaleFromHeaders = (request: Request): AvailableLanguageTag => {
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) return 'en';

  const langs = acceptLanguage.split(',').map((lang) => {
    const [locale] = lang.trim().split(';');
    return locale;
  });

  for (const lang of langs) {
    const locale = lang.toLowerCase();
    if (
      locale.startsWith('zh-hant') ||
      locale.startsWith('zh-tw') ||
      locale.startsWith('zh-hk')
    ) {
      return 'zh-hant';
    }
    if (locale.startsWith('zh-hans') || locale.startsWith('zh-cn')) {
      return 'zh-hans';
    }
    if (locale.startsWith('en')) {
      return 'en';
    }
  }

  return 'en';
};

export const GET: RequestHandler = async ({ url, request, platform }) => {
  console.log('manifest.webmanifest');
  const { code: hubCode } = getHubFromDomain(url.hostname);

  if (!hubCode) return error(404, 'Hub not found');

  const { db } = await getDatabaseWithoutAuth(platform);

  const hub = await getHubByCode(db, hubCode);
  if (!hub) return error(404, 'Hub not found');

  const baseManifest = await getBaseManifest(hub.code);
  if (!baseManifest) return error(404, `Manifest for hub "${hub.code}" not found`);

  const locale = getLocaleFromHeaders(request);

  console.log(locale);
  console.log(hub.i18n);

  const i18nData =
    hub.i18n.find((i) => i.locale === locale) ||
    hub.i18n.find((i) => i.locale === 'en');

  console.log(i18nData);
  const manifest = {
    ...baseManifest,
    name: i18nData?.name || 'HYPE',
    short_name: i18nData?.nameShort || 'HYPE',
    lang: locale,
    description: i18nData?.description || 'A HYPE.HK Hub',
    start_url: hub.domain ? `https://${hub.domain}` : '/'
  };
  // remove default as it's a module property
  delete manifest.default;

  const headers = {
    'Content-Type': 'application/manifest+json',
    'Cache-Control': 'public, max-age=600'
  };

  return new Response(JSON.stringify(manifest), { headers });
};
