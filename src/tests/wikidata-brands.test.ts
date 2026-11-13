// TESTS
import { expect, it } from 'vitest'
// SERVICES
import {
  readWikidataBrand,
  searchWikidataBrands,
} from '../lib/api/services/wikidataBrands'

/** Supply ordered API fixtures while retaining the requested URLs.
 * @param bodies Provider responses. @returns Transport and observed calls.
 */
function provider(...bodies: unknown[]): { fetcher: typeof fetch; urls: URL[] } {
  const urls: URL[] = []
  const fetcher = (async (input: URL | RequestInfo) => {
    urls.push(new URL(String(input)))
    return Response.json(bodies.shift())
  }) as typeof fetch
  return { fetcher, urls }
}
const entity = {
  entities: {
    Q123: {
      id: 'Q123',
      labels: { en: { value: 'Bakery' } },
      claims: { P154: [{ mainsnak: { datavalue: { value: 'Bakery.svg' } } }] },
    },
  },
}

it('returns explicit search candidates without constructing a source mapping', async () => {
  const p = provider({
    search: [{ id: 'Q123', label: 'Bakery', description: 'bakery chain' }],
  })
  expect(await searchWikidataBrands('Bakery & Sons', p.fetcher)).toEqual([
    { id: 'Q123', label: 'Bakery', description: 'bakery chain' },
  ])
  expect(p.urls[0].searchParams.get('search')).toBe('Bakery & Sons')
  expect(p.urls[0].hostname).toBe('www.wikidata.org')
})
it('resolves the logo property and preserves Commons attribution as plain text', async () => {
  const p = provider(entity, {
    query: {
      pages: {
        '1': {
          imageinfo: [
            {
              thumburl: 'https://upload.wikimedia.org/bakery.svg.png',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Bakery.svg',
              extmetadata: {
                CommonsMetadataExtension: { value: 1.2 },
                Artist: { value: '<a>Artist</a>' },
                LicenseShortName: { value: 'CC BY-SA 4.0' },
              },
            },
          ],
        },
      },
    },
  })
  const record = await readWikidataBrand('Q123', p.fetcher)
  expect(record.logo?.attribution).toBe('Artist')
  expect(record.logo?.license).toBe('CC BY-SA 4.0')
  expect(p.urls[1].searchParams.get('titles')).toBe('File:Bakery.svg')
})
it('supports entities without logos and validates entities without requesting Commons', async () => {
  const p = provider({ entities: { Q123: { id: 'Q123' } } }, entity)
  expect((await readWikidataBrand('Q123', p.fetcher)).logo).toBeNull()
  expect((await readWikidataBrand('Q123', p.fetcher, false)).logo).toBeNull()
  expect(p.urls).toHaveLength(2)
})
it('rejects missing entities, invalid IDs, provider failures and foreign image hosts', async () => {
  await expect(readWikidataBrand('Q0', provider().fetcher)).rejects.toThrow()
  await expect(
    readWikidataBrand(
      'Q123',
      provider({ entities: { Q123: { missing: '' } } }).fetcher,
    ),
  ).rejects.toThrow()
  await expect(
    searchWikidataBrands(
      'Bakery',
      provider({ error: { code: 'ratelimited' } }).fetcher,
    ),
  ).rejects.toThrow('WIKIDATA_UNAVAILABLE')
  const p = provider(entity, {
    query: {
      pages: {
        '1': {
          imageinfo: [
            {
              thumburl: 'https://example.com/logo.png',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Bakery.svg',
            },
          ],
        },
      },
    },
  })
  expect((await readWikidataBrand('Q123', p.fetcher)).logo).toBeNull()
})
