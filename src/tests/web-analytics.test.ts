// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { installWebAnalytics } from '../lib/analytics/webAnalytics'

/** Creates an isolated document with an explicit deployment origin.
 * @param url - Browser origin to simulate.
 * @returns Document without network script execution.
 */
function documentAt(url: string): Document {
  const environment = globalThis as unknown as {
    jsdom: { reconfigure: (options: { url: string }) => void }
  }
  environment.jsdom.reconfigure({ url })
  document.head.replaceChildren()
  document.body.replaceChildren()
  return document
}

describe('production Web Analytics installation', () => {
  it.each(['hype.hk', 'hkghostsigns.com'])(
    'installs one public beacon for %s',
    hostname => {
      const doc = documentAt(`https://${hostname}/`)
      expect(installWebAnalytics(doc)).toBe(true)
      expect(installWebAnalytics(doc)).toBe(false)
      const scripts = doc.querySelectorAll('script[data-cf-beacon]')
      expect(scripts).toHaveLength(1)
      expect(
        JSON.parse(scripts[0].getAttribute('data-cf-beacon') ?? '{}').send,
      ).toEqual({
        to:
          hostname === 'hype.hk'
            ? '/cdn-cgi/rum'
            : 'https://cloudflareinsights.com/cdn-cgi/rum',
      })
      expect(scripts[0].getAttribute('src')).toBe(
        'https://static.cloudflareinsights.com/beacon.min.js',
      )
      expect(
        JSON.parse(scripts[0].getAttribute('data-cf-beacon') ?? '{}').token,
      ).toMatch(/^[a-f0-9]{32}$/)
    },
  )

  it.each([
    'http://hype.localhost',
    'http://127.0.0.1:4173',
    'https://preview.hype.hk',
    'https://breadline.hk',
    'https://hype.hk:4173',
    'http://hype.hk',
  ])('does not track %s', url => {
    const doc = documentAt(url)
    expect(installWebAnalytics(doc)).toBe(false)
    expect(doc.scripts).toHaveLength(0)
  })

  it('preserves an existing edge-injected beacon', () => {
    const doc = documentAt('https://hype.hk')
    const script = doc.createElement('script')
    script.dataset.cfBeacon = '{"token":"existing"}'
    doc.head.append(script)
    expect(installWebAnalytics(doc)).toBe(false)
    expect(doc.scripts).toHaveLength(1)
    expect(script.dataset.cfBeacon).toBe('{"token":"existing"}')
  })
})
