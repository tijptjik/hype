import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTranslateWithAzure, mockGuardedContext } = vi.hoisted(() => ({
  mockTranslateWithAzure: vi.fn(async (texts: string[]) =>
    texts.map(text => `${text}-x`),
  ),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedCommand: (_schema: unknown, handler: unknown) => async (input: unknown) =>
    (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
      input,
      await mockGuardedContext(),
    ),
}))

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('$lib/api/external/translation', () => ({
  translateText: mockTranslateWithAzure,
}))

let remote: Awaited<typeof import('$lib/api/server/translation.remote')>

describe('translation.remote', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/translation.remote')
    vi.clearAllMocks()
    mockGuardedContext.mockResolvedValue({
      event: {
        platform: {
          env: {
            AZURE_TRANSLATION_KEY: 'key-1',
            PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
          },
        },
      },
    })
  })

  it('throws when azure translation key is missing', async () => {
    mockGuardedContext.mockResolvedValue({
      event: {
        platform: {
          env: {
            PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
          },
        },
      },
    })

    await expect(
      remote.translateText({
        source: 'en',
        target: 'zh-hant',
        texts: ['hello'],
      }),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('forwards params to azure translation service', async () => {
    const result = await remote.translateText({
      source: 'en',
      target: 'zh-hant',
      texts: ['hello', 'world'],
    })

    expect(mockTranslateWithAzure).toHaveBeenCalledWith(
      ['hello', 'world'],
      'en',
      'zh-hant',
      'eastasia',
      'key-1',
    )
    expect(result).toEqual(['hello-x', 'world-x'])
  })
})
