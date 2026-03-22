import { error } from '@sveltejs/kit'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. INTERNAL PREVIEW AUTH
//    - requirePreviewRenderAccess
//    - requirePreviewRefreshAccess

const isAuthorizedInternalRequest = (
  providedToken: string | null,
  expectedToken: string | undefined,
  environment: string | undefined,
): boolean => {
  if (environment === 'local') {
    return true
  }

  return Boolean(expectedToken) && providedToken === expectedToken
}

/**
 * Guards internal preview-render payload routes from public access outside local development.
 *
 * @param request Incoming request carrying optional internal auth headers.
 * @param url Parsed request URL for query-param token lookup.
 * @param platform Request platform bindings and environment values.
 * @returns Nothing. Throws a 401 when the request is not authorized.
 */
export const requirePreviewRenderAccess = (
  request: Request,
  url: URL,
  platform: App.Platform | undefined,
): void => {
  const providedToken =
    request.headers.get('x-map-preview-render-token') ?? url.searchParams.get('token')
  const expectedToken = platform?.env.MAP_PREVIEW_RENDER_TOKEN
  const environment = platform?.env.ENVIRONMENT

  if (!isAuthorizedInternalRequest(providedToken, expectedToken, environment)) {
    throw error(401, 'Preview render access denied')
  }
}

/**
 * Guards the preview refresh endpoint so only local commands or trusted schedulers can trigger it.
 *
 * @param request Incoming request carrying the scheduler token header.
 * @param platform Request platform bindings and environment values.
 * @returns Nothing. Throws a 401 when the request is not authorized.
 */
export const requirePreviewRefreshAccess = (
  request: Request,
  platform: App.Platform | undefined,
): void => {
  const providedToken = request.headers.get('x-map-preview-refresh-token')
  const expectedToken = platform?.env.MAP_PREVIEW_REFRESH_TOKEN
  const environment = platform?.env.ENVIRONMENT

  if (!isAuthorizedInternalRequest(providedToken, expectedToken, environment)) {
    throw error(401, 'Preview refresh access denied')
  }
}
