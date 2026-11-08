// SHARING
import { loadShareResource } from '#lib/sharing/resource.server.js'
// TYPES
import type { PageServerLoad } from './$types'

/** Resolves public resource metadata for browsers and social crawlers.
 * @param event Request scope and resource reference. @returns Public share metadata.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const shareResource = await loadShareResource(locals, 'feature', params.id)
  // Private feature views retain their existing authorized client flow without public metadata.
  return { shareResource }
}
