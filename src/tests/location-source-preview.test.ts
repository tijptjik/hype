// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { readSaanSeoiPlacePreview } from '#lib/locations/sourcePreview.js'

const input = { ssId: 'ss-shop', resourceReleaseId: 'release' }
const response = {
  place: {
    id: input.ssId,
    resourceReleaseId: 'release',
    geometry: { type: 'Point', coordinates: [114.18201, 22.278698] },
    phones: ['3615 8777'],
    basicCategory: 'bakery',
    taxonomy: {
      primary: 'bakery',
      hierarchy: ['food_and_drink', 'bakery'],
      alternates: ['cafe'],
    },
  },
  i18n: {
    en: { name: 'Shop', freeformAddress: '8 Russell St' },
    'zh-hant': { name: '商店' },
  },
}
const client = (body: unknown) => ({
  baseUrl: 'https://example.test',
  apiKey: 'test',
  fetch: vi.fn(async () => Response.json(body)) as unknown as typeof fetch,
})

it('previews a latest-source record without canonical collection support or fabricated evidence', async () => {
  const transport = client(response)
  const facts = await readSaanSeoiPlacePreview(transport, input)
  expect(facts.names).toEqual({ en: 'Shop', 'zh-hant': '商店' })
  expect(facts.classification).toEqual({
    basicCategory: response.place.basicCategory,
    taxonomy: response.place.taxonomy,
  })
  expect(facts.phoneNumber).toEqual(['+85236158777'])
  expect(facts.location.address).toMatchObject({
    status: 'unresolved',
    rawSource: {},
    address2dId: null,
    fallbackDisplay: { en: '8 Russell St' },
  })
  expect(transport.fetch).toHaveBeenCalledWith(
    new URL('https://example.test/places/v0.1/ss-shop?region=hk'),
    expect.objectContaining({ redirect: 'error' }),
  )
})
it.each([{ id: 'different' }, { resourceReleaseId: 'changed' }])(
  'rejects identity/release drift %j',
  async patch => {
    await expect(
      readSaanSeoiPlacePreview(
        client({ ...response, place: { ...response.place, ...patch } }),
        input,
      ),
    ).rejects.toThrow('identity or release changed')
  },
)
it('never turns an unavailable detail endpoint into empty facts', async () => {
  const transport = client(response)
  transport.fetch = vi.fn(
    async () => new Response('', { status: 503 }),
  ) as unknown as typeof fetch
  await expect(readSaanSeoiPlacePreview(transport, input)).rejects.toThrow('503')
})

it('preserves search status and resolves taxonomy primary from the source taxonomy', async () => {
  const facts = await readSaanSeoiPlacePreview(
    client({
      ...response,
      place: { ...response.place, operatingStatus: 'permanently_closed' },
    }),
    input,
  )
  expect(facts.searchClassification).toEqual({
    basicCategory: 'bakery',
    taxonomyPrimary: 'bakery',
    operatingStatus: 'permanently_closed',
  })
})
