// SVELTEKIT
import { redirect } from '@sveltejs/kit'
// TYPES
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  throw redirect(302, '/features/elnBook00010?panel=passport')
}
