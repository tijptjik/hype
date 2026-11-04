// TESTING
import { describe, expect, it, vi } from 'vitest'
// I18N
import * as m from '#lib/paraglide/messages.js'
import { getLocale, locales } from '#lib/paraglide/runtime.js'
import { paraglideMiddleware } from '#lib/paraglide/server.js'
// MESSAGE FILES
import en from '../../messages/en.json'
import zhHans from '../../messages/zh-hans.json'
import zhHant from '../../messages/zh-hant.json'

const messages = { en, 'zh-hans': zhHans, 'zh-hant': zhHant }

describe('generated Paraglide runtime', () => {
  it('preserves locale cookies and isolates concurrent server rendering', async () => {
    vi.useRealTimers()
    // Overlap requests so a global locale would leak between English and Chinese renders.
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => locales)
        .flat()
        .map(async locale => {
          const response = await paraglideMiddleware(
            new Request('https://hype.test/policy/terms', {
              headers: { cookie: `PARAGLIDE_LOCALE=${locale}` },
            }),
            async ({ locale: requestLocale }) => {
              await new Promise(resolve => setTimeout(resolve, 5))
              expect(requestLocale).toBe(locale)
              expect(getLocale()).toBe(locale)
              return new Response(m.forms__save())
            },
          )
          expect(response.status).toBe(200)
          expect(await response.text()).toBe(messages[locale].forms__save)
          return response
        }),
    )
    expect(responses).toHaveLength(locales.length * 4)
  })

  it.each([undefined, 'unsupported'])(
    'falls back for locale cookie %s',
    async cookie => {
      const response = await paraglideMiddleware(
        new Request('https://hype.test/policy/terms', {
          headers: cookie ? { cookie: `PARAGLIDE_LOCALE=${cookie}` } : {},
        }),
        ({ locale }) => {
          expect(locale).toBe('en')
          return new Response(m.forms__save())
        },
      )
      expect(await response.text()).toBe(en.forms__save)
    },
  )

  it('keeps form request bodies readable after locale resolution', async () => {
    const response = await paraglideMiddleware(
      new Request('https://hype.test/signin', {
        method: 'POST',
        headers: { cookie: 'PARAGLIDE_LOCALE=zh-hant' },
        body: new URLSearchParams({ name: 'Paraglide upgrade' }),
      }),
      async ({ request, locale }) => {
        expect(locale).toBe('zh-hant')
        expect((await request.formData()).get('name')).toBe('Paraglide upgrade')
        return new Response(m.forms__save())
      },
    )
    expect(await response.text()).toBe(zhHant.forms__save)
  })
})
