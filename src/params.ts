import { defineParams } from '@sveltejs/kit/params'

/**
 * Matches the supported asset stages without importing runtime enum modules.
 * @param param - URL segment to validate.
 * @returns Whether the segment names a supported stage.
 */
function matchAppEnv(param: string): boolean {
  return param === 'local' || param === 'preview' || param === 'production'
}

export const params = defineParams({
  appEnv: param => (matchAppEnv(param) ? param : undefined),
})
