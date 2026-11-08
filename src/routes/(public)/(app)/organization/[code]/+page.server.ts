// SVELTEKIT
import { redirect } from '@sveltejs/kit'
// SHARING
import { sharePath } from '#lib/sharing/resource.js'
// TYPES
import type { PageServerLoad } from './$types'

/** Normalizes the alternative organisation spelling to one canonical address.
 * @param event Organisation code. @returns A permanent redirect to its public URL.
 */
export const load: PageServerLoad = ({ params }) => {
  redirect(308, sharePath({ kind: 'organisation', ref: params.code }))
}
