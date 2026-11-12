// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// API
import { translateContentField } from '#lib/api/external/translation.js'

afterEach(() => vi.unstubAllGlobals())

describe('content translation chunks', () => {
  it.each([
    [
      'paragraphs',
      `${'First paragraph. '.repeat(280)}\n\n${'Second paragraph. '.repeat(280)}\n\nEnd.`,
    ],
    [
      'Markdown policy',
      '# 私隱政策\n\n## 資料收集\n\n' +
        '我們只收集必要的資料。'.repeat(600) +
        '\n\n[聯絡我們](https://example.com/privacy)',
    ],
    ['long unbroken text', '字'.repeat(16_000)],
    ['surrogate boundary', `${'a'.repeat(4999)}😀${'b'.repeat(6000)}`],
    ['boundary whitespace', `  ${'word '.repeat(2500)}\n\n  `],
  ])('preserves %s and sends bounded chunks in order', async (_label, text) => {
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      const entries = JSON.parse(String(init.body)) as { text: string }[]
      expect(entries.length).toBeGreaterThan(1)
      for (const entry of entries) {
        expect(entry.text.length).toBeLessThanOrEqual(5000)
        expect(entry.text.length).toBeGreaterThan(0)
        expect(entry.text.isWellFormed()).toBe(true)
      }
      return Response.json(
        entries.map(entry => ({ translations: [{ text: entry.text }] })),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await translateContentField(
      { text, source: 'en', target: 'zh-Hant' },
      'eastasia',
      'test',
    )
    expect(result).toMatchObject({ status: 'translated', text })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reassembles translated chunks with original paragraph separators', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { translations: [{ text: '第一段' }] },
          { translations: [{ text: '第二段' }] },
        ]),
      ),
    )
    const result = await translateContentField(
      {
        text: `${'a'.repeat(4000)}\n\n${'b'.repeat(2000)}`,
        source: 'en',
        target: 'zh-Hant',
      },
      'eastasia',
      'test',
    )
    expect(result).toMatchObject({ status: 'translated', text: '第一段\n\n第二段' })
  })

  it.each(['missing', 'empty', 'failure'])(
    'returns no partial field for a %s chunk response',
    async failure => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          failure === 'failure'
            ? Response.json({ error: { code: 500000 } }, { status: 500 })
            : Response.json([
                { translations: [{ text: 'First translated paragraph' }] },
                ...(failure === 'empty' ? [{ translations: [{ text: '' }] }] : []),
              ]),
        ),
      )
      const result = await translateContentField(
        {
          text: `${'a'.repeat(4000)}\n\n${'b'.repeat(2000)}`,
          source: 'en',
          target: 'zh-Hant',
        },
        'eastasia',
        'test',
      )
      expect(result.status).toBe('error')
      expect(result).not.toHaveProperty('text')
    },
  )
})
