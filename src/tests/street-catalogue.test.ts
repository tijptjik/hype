import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { loadStreetCatalogue } from '../lib/addresses/streetCatalogue'

const manifestUrl = 'https://fixture.invalid/mocks/saanseoi/streets/names/manifest.json'
const directory = new URL('../../static/mocks/saanseoi/streets/names/', import.meta.url)
const fixtureFetch = (async (input: string | URL | Request) => {
  const path = new URL(String(input)).pathname
  return new Response(
    await readFile(
      new URL(
        path.endsWith('manifest.json') ? 'manifest.json' : 'data.json',
        directory,
      ),
      'utf8',
    ),
  )
}) as typeof fetch

it('loads the complete baseline with canonical IDs and division codes without inventing translations', async () => {
  const catalogue = await loadStreetCatalogue(manifestUrl, fixtureFetch)
  expect(catalogue.mock).toBe(true)
  expect(catalogue.apiReleaseSetId).toBeNull()
  expect(catalogue.streets).toHaveLength(4053)
  expect(
    catalogue.streets.find(row => row.id === '019f9fc3-0cac-7bd9-a79f-cf17fb6138c6'),
  ).toMatchObject({ names: { en: 'CHUNG KING ROAD' }, divisionCodes: ['CW'] })
  expect(catalogue.streets.some(row => row.divisionCodes.length > 1)).toBe(true)
  expect(catalogue.streets.every(row => row.names['zh-Hans'] === undefined)).toBe(true)
})

it('rejects tampered bytes instead of returning a partially trusted catalogue', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const response = await fixtureFetch(input)
    return String(input).endsWith('data.json')
      ? new Response((await response.text()).replace('ROAD', 'road'))
      : response
  }) as typeof fetch
  await expect(loadStreetCatalogue(manifestUrl, fetcher)).rejects.toThrow(
    'checksum mismatch',
  )
})

it('reports an unavailable manifest', async () => {
  await expect(
    loadStreetCatalogue(
      manifestUrl,
      (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    ),
  ).rejects.toThrow('HTTP 503')
})
