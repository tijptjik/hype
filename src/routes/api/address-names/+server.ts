// SVELTE
import { error, json } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// ADDRESS
import { findAddressNames } from '#lib/addresses/nameSearch.server.js'
// TYPES
import type { RequestHandler } from './$types'

const SearchInput = z.object({
  family: z.enum(['streets', 'buildings']),
  locale: z.enum(['en', 'zhHant', 'zhHans']),
  q: z.string().trim().max(160),
})

/** Return bounded suggestions from public building and street vocabularies.
 * @param event Request URL containing family, locale and q.
 * @returns Up to 30 published names; no private Location or Feature data is exposed.
 * @remarks Empty queries do not load an inventory. Source failures remain retryable.
 */
export const GET: RequestHandler = async ({ url }) => {
  const input = SearchInput.safeParse(Object.fromEntries(url.searchParams))
  if (!input.success) error(400, 'Invalid name search')
  try {
    const { family, locale, q } = input.data
    const records = await findAddressNames(family, q, locale)
    return json({ records }, { headers: { 'cache-control': 'public, max-age=60' } })
  } catch {
    error(502, 'Name suggestions are temporarily unavailable')
  }
}
