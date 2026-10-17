// SVELTEKIT
import { redirect } from '@sveltejs/kit'
// TYPES
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  // Redirect to home page with settings panel open
  throw redirect(302, '/?panel=settings')
}
