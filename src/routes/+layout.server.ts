import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ platform, locals }) => {
  return {
    hub: locals.hub,
  }
}
