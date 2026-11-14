import { error } from '@sveltejs/kit'
import { findStation } from '#lib/indoor/registry.js'
import type { PageServerLoad } from './$types'
/** Validates the public premises namespace. @param event Route parameters. @returns Empty page data; the shared surface loads source geometry. */
export const load: PageServerLoad = ({ params }) => {
  if (!/^mtr-[a-z]{3}$/.test(params.premises) || !findStation(params.premises.slice(4)))
    error(404, 'Premises not found')
  if (params.place && !/^places\/[0-9a-f-]{36}$/.test(params.place))
    error(404, 'Place not found')
  return {}
}
