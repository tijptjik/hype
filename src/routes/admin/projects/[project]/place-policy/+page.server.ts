// SVELTE
import { redirect } from '@sveltejs/kit'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Redirect old settings bookmarks into the project's established tab navigation.
 * @param event Route parameters containing the project reference.
 * @returns A redirect response targeting the Place updates tab.
 */
export const load: PageServerLoad = ({ params }) => {
  redirect(307, `/admin/projects/${encodeURIComponent(params.project)}#policies`)
}
