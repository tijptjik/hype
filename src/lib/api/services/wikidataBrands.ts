// VALIDATION
import { z } from 'zod'

// TABLE OF CONTENTS
// 1. Provider requests and result contracts
// 2. Explicit entity and logo lookup

export const WikidataIdSchema = z.string().regex(/^Q[1-9]\d{0,15}$/)
const LabelSchema = z.object({ value: z.string() })
const EntitySchema = z.object({
  id: WikidataIdSchema,
  labels: z.record(z.string(), LabelSchema).default({}),
  descriptions: z.record(z.string(), LabelSchema).default({}),
  claims: z
    .object({
      P154: z
        .array(
          z.object({
            rank: z.string().optional(),
            mainsnak: z.object({
              datavalue: z.object({ value: z.string() }).optional(),
            }),
          }),
        )
        .optional(),
    })
    .default({}),
})
export type WikidataBrand = {
  id: string
  label: string
  description: string
  logo: { url: string; sourceUrl: string; attribution: string; license: string } | null
}

/** Request a bounded public Wikimedia API response from a fixed provider endpoint.
 * @param host Trusted API host. @param params Action parameters. @param fetcher Request implementation.
 * @returns Parsed JSON; provider errors remain visible to the editor.
 */
async function request(
  host: 'www.wikidata.org' | 'commons.wikimedia.org',
  params: Record<string, string>,
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = new URL(`https://${host}/w/api.php`)
  url.search = new URLSearchParams({ format: 'json', ...params }).toString()
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'HypeCatalogue/1.0 (brand identity lookup)' },
  })
  if (!response.ok) throw new Error('WIKIDATA_UNAVAILABLE')
  const body = await response.json()
  if (body && typeof body === 'object' && 'error' in body)
    throw new Error('WIKIDATA_UNAVAILABLE')
  return body
}

/** Search Wikidata labels; results are suggestions and never establish identity automatically.
 * @param search Brand name. @param fetcher Provider transport.
 * @returns Up to eight entities with descriptions for explicit review.
 */
export async function searchWikidataBrands(
  search: string,
  fetcher: typeof fetch = fetch,
): Promise<Omit<WikidataBrand, 'logo'>[]> {
  const body = z
    .object({
      search: z.array(
        z.object({
          id: WikidataIdSchema,
          label: z.string().optional(),
          description: z.string().optional(),
        }),
      ),
    })
    .parse(
      await request(
        'www.wikidata.org',
        {
          action: 'wbsearchentities',
          search,
          language: 'en',
          uselang: 'en',
          type: 'item',
          limit: '8',
        },
        fetcher,
      ),
    )
  return body.search.map(row => ({
    id: row.id,
    label: row.label ?? row.id,
    description: row.description ?? '',
  }))
}

/** Resolve a reviewed Wikidata entity and its optional P154 Wikimedia Commons logo.
 * @param id Exact entity identifier. @param fetcher Provider transport. @param includeLogo Whether to query Commons.
 * @returns Entity plus a raster thumbnail and plain-text attribution when available.
 */
export async function readWikidataBrand(
  id: string,
  fetcher: typeof fetch = fetch,
  includeLogo = true,
): Promise<WikidataBrand> {
  WikidataIdSchema.parse(id)
  const body = z.object({ entities: z.record(z.string(), z.unknown()) }).parse(
    await request(
      'www.wikidata.org',
      {
        action: 'wbgetentities',
        ids: id,
        props: 'labels|descriptions|claims',
        languages: 'en',
      },
      fetcher,
    ),
  )
  const entity = EntitySchema.parse(body.entities[id])
  const result: WikidataBrand = {
    id: entity.id,
    label: entity.labels.en?.value ?? id,
    description: entity.descriptions.en?.value ?? '',
    logo: null,
  }
  const file = entity.claims.P154?.find(
    claim => claim.rank !== 'deprecated' && claim.mainsnak.datavalue?.value,
  )?.mainsnak.datavalue?.value
  if (!file || !includeLogo) return result
  const info = z
    .object({
      query: z.object({
        pages: z.record(
          z.string(),
          z.object({
            imageinfo: z
              .array(
                z.object({
                  thumburl: z.string().optional(),
                  descriptionurl: z.string(),
                  extmetadata: z
                    .object({
                      Artist: LabelSchema.optional(),
                      LicenseShortName: LabelSchema.optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          }),
        ),
      }),
    })
    .parse(
      await request(
        'commons.wikimedia.org',
        {
          action: 'query',
          titles: `File:${file}`,
          prop: 'imageinfo',
          iiprop: 'url|extmetadata',
          iiurlwidth: '512',
        },
        fetcher,
      ),
    )
  const image = Object.values(info.query.pages)[0]?.imageinfo?.[0]
  if (image?.thumburl) {
    const url = new URL(image.thumburl)
    const source = new URL(image.descriptionurl)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'upload.wikimedia.org' &&
      source.protocol === 'https:' &&
      source.hostname === 'commons.wikimedia.org'
    ) {
      result.logo = {
        url: url.href,
        sourceUrl: source.href,
        attribution: (image.extmetadata?.Artist?.value ?? '')
          .replace(/<[^>]*>/g, '')
          .slice(0, 2000),
        license: (image.extmetadata?.LicenseShortName?.value ?? '')
          .replace(/<[^>]*>/g, '')
          .slice(0, 200),
      }
    }
  }
  return result
}
