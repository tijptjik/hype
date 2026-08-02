// SVELTEKIT
import { json } from '@sveltejs/kit'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Reports the completion status of a Facebook data deletion request.
 *
 * @param event - Request containing Meta's confirmation code.
 * @returns A public status response for Facebook's deletion workflow.
 */
export const GET: RequestHandler = ({ url }) => {
  const confirmationCode = url.searchParams.get('code')
  return json({
    status:
      confirmationCode && /^[a-f0-9]{64}$/.test(confirmationCode)
        ? 'completed'
        : 'unknown',
    confirmation_code: confirmationCode,
  })
}
