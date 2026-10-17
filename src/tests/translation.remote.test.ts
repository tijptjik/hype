// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const { mockTranslateWithAzure, mockGuardedContext } = vi.hoisted(() => ({
  mockTranslateWithAzure: vi.fn(async (texts: string[]) =>
    texts.map(text => `${text}-x`),
  ),
  mockGuardedContext: vi.fn(),
}))

vi.mock('#lib/api/server/guarded.js', () => ({
  guardedCommand: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
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
}))

let remote: Awaited<typeof import('#lib/api/translation.remote.js')>

describe('translation.remote', () => {
  // Hoisted factories are stable; reset request mocks without reloading dependencies.
  beforeAll(async () => {
    remote = await import('#lib/api/translation.remote.js')
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
})
