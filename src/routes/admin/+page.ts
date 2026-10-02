// SVELTE
import { redirect } from '@sveltejs/kit'
// LIB
import { ADMIN_PATH } from '#lib/index.js'
// ENUMS
import { FirstClassResource, ResourcePath } from '#lib/enums.js'

const DEFAULT_RESOURCE = FirstClassResource.feature

export function load() {
  const resourcePath = ResourcePath[DEFAULT_RESOURCE]
  return redirect(307, `${ADMIN_PATH}/${resourcePath}`)
}
