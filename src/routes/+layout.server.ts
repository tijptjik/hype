import { getTitleEnvironmentLabel } from '#lib/navigation/title.js'
import type { LayoutServerLoad } from './$types'

/**
 * Loads root app data shared by all route trees.
 *
 * @param event The root layout server load event.
 * @returns Hub and runtime display metadata.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    devPersona: locals.devPersona ?? null,
    hub: locals.hub,
    titleEnvironmentLabel: getTitleEnvironmentLabel(locals.platform?.env?.ENVIRONMENT),
  }
}
