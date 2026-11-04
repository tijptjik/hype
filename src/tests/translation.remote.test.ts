import { mockedRemoteModule, type MockedRemoteModule } from './remote-function-mock'
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const { mockTranslateWithAzure, mockTranslateField, mockGuardedContext } = vi.hoisted(
  () => ({
    mockTranslateWithAzure: vi.fn(async (texts: string[]) =>
      texts.map(text => `${text}-x`),
    ),
    mockTranslateField: vi.fn(
      async (input: { source: string; target: string; text: string }) => ({
        ...input,
        status: 'translated' as const,
        text: '翻訳',
      }),
    ),
    mockGuardedContext: vi.fn(),
  }),
)

vi.mock('#lib/api/server/guarded.js', () => ({
  guardedCommand: (schema: { parse: (input: unknown) => unknown }, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        schema.parse(input),
        await mockGuardedContext(),
      )
    }, 'command'),
}))

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('#lib/api/external/translation.js', () => ({
  translateText: mockTranslateWithAzure,
  translateContentField: mockTranslateField,
}))

let remote: MockedRemoteModule<typeof import('#lib/api/translation.remote.js')>

describe('translation.remote', () => {
  // Hoisted factories are stable; reset request mocks without reloading dependencies.
  beforeAll(async () => {
    remote = mockedRemoteModule(await import('#lib/api/translation.remote.js'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardedContext.mockResolvedValue({
      user: { id: 'u-1', isAnonymous: false },
      event: {
        locals: {
          platform: {
            env: {
              AZURE_TRANSLATION_KEY: 'key-1',
              PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
            },
          },
        },
      },
    })
  })

  it('throws when azure translation key is missing', async () => {
    mockGuardedContext.mockResolvedValue({
      user: { id: 'u-1', isAnonymous: false },
      event: {
        locals: {
          platform: {
            env: {
              PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
            },
          },
        },
      },
    })

    await expect(
      remote.translateText({
        source: 'en',
        target: 'zhHant',
        texts: ['hello'],
      }),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('forwards params to azure translation service', async () => {
    const result = await remote.translateText({
      source: 'en',
      target: 'zhHant',
      texts: ['hello', 'world'],
    })

    expect(mockTranslateWithAzure).toHaveBeenCalledWith(
      ['hello', 'world'],
      'en',
      'zhHant',
      'eastasia',
      'key-1',
    )
    expect(result).toEqual(['hello-x', 'world-x'])
  })

  it('requires an upgraded account before spending translation quota', async () => {
    mockGuardedContext.mockResolvedValue({
      user: { id: 'guest-1', isAnonymous: true },
      event: {
        locals: {
          platform: {
            env: {
              AZURE_TRANSLATION_KEY: 'key-1',
              PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
            },
          },
        },
      },
    })

    await expect(
      remote.translateText({
        source: 'en',
        target: 'zhHant',
        texts: ['hello'],
      }),
    ).rejects.toMatchObject({ status: 403, message: 'ACCOUNT_REQUIRED' })
    expect(mockTranslateWithAzure).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'empty batch', texts: [] },
    { name: 'too many entries', texts: Array.from({ length: 101 }, () => 'a') },
    { name: 'oversized entry', texts: ['a'.repeat(5_001)] },
    {
      name: 'excess total volume',
      texts: Array.from({ length: 11 }, () => 'a'.repeat(5_000)),
    },
  ])('rejects $name before invoking the provider', async ({ texts }) => {
    await expect(
      remote.translateText({ source: 'en', target: 'ja', texts }),
    ).rejects.toThrow()
    expect(mockTranslateWithAzure).not.toHaveBeenCalled()
  })

  it('rejects an oversized content field before invoking the provider', async () => {
    await expect(
      remote.translateContentField({
        source: 'en',
        target: 'ja',
        text: 'a'.repeat(8193),
      }),
    ).rejects.toThrow()
    expect(mockTranslateField).not.toHaveBeenCalled()
  })

  it('exposes a single dynamic target result without changing the request', async () => {
    const input = Object.freeze({ source: 'en', target: 'ja', text: 'Cafe' })
    expect(await remote.translateContentField(input)).toEqual({
      status: 'translated',
      source: 'en',
      target: 'ja',
      text: '翻訳',
    })
    expect(mockTranslateField).toHaveBeenCalledWith(input, 'eastasia', 'key-1')
    expect(input.text).toBe('Cafe')
  })

  it('guards single-field translation before spending provider quota', async () => {
    mockGuardedContext.mockResolvedValue({
      user: { id: 'guest', isAnonymous: true },
      event: { locals: {} },
    })
    await expect(
      remote.translateContentField({ source: 'en', target: 'ja', text: 'Cafe' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockTranslateField).not.toHaveBeenCalled()
  })
})
