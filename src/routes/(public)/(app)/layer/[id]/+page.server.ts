// SVELTEKIT
import { error } from '@sveltejs/kit'
// SHARING
import { loadShareResource } from '#lib/sharing/resource.server.js'
// TYPES
import type { PageServerLoad } from './$types'

/** Resolves public resource metadata for browsers and social crawlers.
 * @param event Request scope and resource reference. @returns Public share metadata.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const shareResource = await loadShareResource(locals, 'layer', params.id)
  if (!shareResource) error(404, 'Map not found')
  return { shareResource }
}
