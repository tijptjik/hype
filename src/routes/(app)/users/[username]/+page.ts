// SVELTEKIT
import { redirect } from '@sveltejs/kit'
// TYPES
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params }) => {
  // Redirect to home page with profile panel open and username parameter
  throw redirect(302, `/?panel=profile&username=${params.username}`)
}
