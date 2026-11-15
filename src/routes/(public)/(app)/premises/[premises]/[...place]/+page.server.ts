import { error } from '@sveltejs/kit'
import { premisesCode } from '#lib/indoor/registry.js'
import type { PageServerLoad } from './$types'
/** Validates the public premises namespace. @param event Route parameters. @returns Empty page data; the shared surface loads source geometry. */
export const load: PageServerLoad = ({ params }) => {
  if (!premisesCode(params.premises)) error(404, 'Premises not found')
  if (params.place && !/^places\/[0-9a-f-]{36}$/.test(params.place))
    error(404, 'Place not found')
  return {}
}
