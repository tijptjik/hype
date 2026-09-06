import { error, type RequestHandler } from '@sveltejs/kit'
import { JSONResponseOrError } from '$lib/api'

/**
 * Masks diagnostic values whose names identify credentials.
 * @param obj Environment values selected for the public diagnostic response.
 * @returns Values with credential-like entries redacted.
 */
function maskPrivateValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key in obj) {
    if (
      key.startsWith('PRIVATE_') ||
      key.startsWith('SECRET_') ||
      key.endsWith('_TOKEN') ||
      key.endsWith('_KEY') ||
      key.endsWith('_SECRET')
    ) {
      result[key] = '***'
    } else {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Returns runtime diagnostics without requiring an authenticated session.
 * @param event Request locals and platform bindings.
 * @returns JSON diagnostics, or a service-unavailable error without platform bindings.
 */
export const GET: RequestHandler = async ({ locals, platform }) => {
  if (!platform?.env) throw error(503, 'Platform bindings unavailable')
  // HTTP : 200 JSON or 404
  const vars = platform.env
  const env = {
    ENVIRONMENT: vars.ENVIRONMENT,
    NODE_ENV: vars.NODE_ENV,
  }
  const public_vars = Object.fromEntries(
    Object.entries(vars).filter(([key]) => key.startsWith('PUBLIC_')),
  )
  const secret_vars = Object.fromEntries(
    Object.entries(vars).filter(
      ([key]) => !key.startsWith('PUBLIC_') && !Object.keys(env).includes(key),
    ),
  )
  try {
    // HTTP : 200 JSON or 404
    return JSONResponseOrError({
      env,
      vars: maskPrivateValues(public_vars),
      secrets: Object.keys(secret_vars),
      // Anonymous requests have undefined session/user locals; enumerate objects only.
      locals: Object.entries(locals).map(([key, value]) => ({
        [key]: value !== null && typeof value === 'object' ? Object.keys(value) : [],
      })),
    })
  } catch (e) {
    // HEALTH : Request Error
    console.error('Health check error:', e)
    throw error(500, 'Eternal Unhappiness Error')
  }
}
