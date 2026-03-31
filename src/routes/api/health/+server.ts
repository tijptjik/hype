import { error, type RequestHandler } from '@sveltejs/kit'
import { JSONResponseOrError } from '$lib/api'

function maskPrivateValues(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

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

// @ts-expect-error
export const GET: RequestHandler = async ({
  locals,
  platform,
}: {
  locals: App.Locals
  platform: App.Platform
}) => {
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
      locals: Object.keys(locals).map(key => ({
        [key]: Object.keys(locals[key]),
      })),
    })
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e)
    throw error(500, 'Eternal Unhappiness Error')
  }
}
