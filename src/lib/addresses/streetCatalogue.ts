// VALIDATION
import { z } from 'zod'

export const MOCK_STREET_CATALOGUE_MANIFEST =
  '/mocks/saanseoi/streets/names/manifest.json'
const streetSchema = z.object({
  id: z.string().uuid(),
  names: z.object({
    en: z.string().min(1),
    'zh-Hant': z.string().min(1),
    'zh-Hans': z.string().min(1).optional(),
  }),
  divisionCodes: z.array(z.string().min(1)).min(1),
})
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  mock: z.boolean(),
  apiReleaseSetId: z.string().nullable(),
  family: z.literal('streets'),
  region: z.literal('hk'),
  projection: z.literal('names'),
  recordCount: z.number().int().nonnegative(),
  representations: z.array(
    z.object({
      format: z.string(),
      envelope: z.string(),
      files: z
        .array(
          z.object({
            href: z.string().min(1),
            recordCount: z.number().int().nonnegative(),
            byteLength: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .min(1),
    }),
  ),
})
export type StreetCatalogueEntry = z.infer<typeof streetSchema>
export type StreetCatalogue = {
  mock: boolean
  apiReleaseSetId: string | null
  streets: StreetCatalogueEntry[]
}

/** Fetch a catalogue through its manifest, independent of the future API route.
 * @param manifestUrl Absolute manifest URL, resolved against the caller's origin.
 * @param fetcher Browser or SvelteKit fetch implementation.
 * @returns Validated streets and explicit publication/mock identity.
 * @remarks Does not invent translations, cache failures, or accept incomplete chunks.
 */
export async function loadStreetCatalogue(
  manifestUrl: string | URL,
  fetcher: typeof fetch = fetch,
): Promise<StreetCatalogue> {
  const url = new URL(manifestUrl)
  const response = await fetcher(url)
  if (!response.ok)
    throw new Error(`Street catalogue manifest: HTTP ${response.status}`)
  const manifest = manifestSchema.parse(await response.json())
  if (!manifest.mock && !manifest.apiReleaseSetId)
    throw new Error('Missing street catalogue release identity')
  const representation = manifest.representations.find(
    item => item.format === 'json' && item.envelope === 'array',
  )
  if (!representation)
    throw new Error('Street catalogue has no JSON array representation')
  const streets: StreetCatalogueEntry[] = []
  // Verify each chunk before exposing the complete catalogue to the caller.
  for (const file of representation.files) {
    const part = await fetcher(new URL(file.href, url))
    if (!part.ok) throw new Error(`Street catalogue chunk: HTTP ${part.status}`)
    const bytes = await part.arrayBuffer()
    if (bytes.byteLength !== file.byteLength)
      throw new Error('Street catalogue byte count mismatch')
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0'),
    ).join('')
    if (hash !== file.sha256) throw new Error('Street catalogue checksum mismatch')
    const rows = z
      .array(streetSchema)
      .parse(JSON.parse(new TextDecoder().decode(bytes)))
    if (rows.length !== file.recordCount)
      throw new Error('Street catalogue chunk count mismatch')
    streets.push(...rows)
  }
  if (
    streets.length !== manifest.recordCount ||
    new Set(streets.map(row => row.id)).size !== streets.length
  )
    throw new Error('Street catalogue inventory mismatch')
  return { mock: manifest.mock, apiReleaseSetId: manifest.apiReleaseSetId, streets }
}
