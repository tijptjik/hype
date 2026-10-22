// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  preview: vi.fn(),
  context: {
    user: { isAnonymous: false },
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test-key' } } },
      fetch: vi.fn(),
    },
  },
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown) => handler(schema.parse(input), mocks.context), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/locations/sourceClient.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  searchSaanSeoiPlaces: mocks.search,
}))
vi.mock('#lib/locations/sourcePreview.js', () => ({
  readSaanSeoiPlacePreview: mocks.preview,
}))
import { searchDraftLocations } from '#lib/api/draftLocation.remote.js'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.user.isAnonymous = false
})
describe('unsaved Feature Location discovery', () => {
  it('rejects anonymous callers before upstream discovery', async () => {
    mocks.context.user.isAnonymous = true
    await expect(searchDraftLocations({ q: 'Bakery' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('returns read-only previews without requiring a Feature ID and exposes partial failures', async () => {
    mocks.search.mockResolvedValue([
      { placeId: 'a', resourceReleaseId: 'release' },
      { placeId: 'b', resourceReleaseId: 'release' },
    ])
    mocks.preview
      .mockResolvedValueOnce({ names: { en: 'Bakery' } })
      .mockRejectedValueOnce(new Error('unavailable'))
    const result = await searchDraftLocations({ q: 'Bakery', locale: 'en' })
    expect(result).toEqual({
      rows: [{ id: 'a', facts: { names: { en: 'Bakery' } } }],
      partial: true,
    })
    expect(mocks.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 5 }),
    )
  })
})
