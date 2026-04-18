// TYPES
import type { MapRenderAssetKind, MapRenderJob } from '../../types'
// HELPERS
import { buildMapRenderObjectKey } from './storage.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. JOB URL HELPERS
//    - buildMapRenderUrl
//
// 2. JOB PAYLOAD HELPERS
//    - buildMapRenderJob

type MapRenderSubjectKind = Exclude<MapRenderAssetKind, 'styles'>

/**
 * Builds the canonical headless render URL for a project or layer preview.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param kind Preview subject kind.
 * @param identifier Project or layer identifier.
 * @param token Optional internal map render token for protected payload routes.
 * @returns Fully qualified headless preview URL.
 */
export const buildMapRenderUrl = (
  publicOrigin: string | null | undefined,
  kind: MapRenderSubjectKind,
  identifier: string,
  token?: string | null,
): string => {
  const url = new URL(
    `/headless/map-${kind === 'projects' ? 'project' : 'layer'}-render/${identifier}`,
    publicOrigin ?? 'http://localhost:5173',
  )

  if (token) {
    url.searchParams.set('token', token)
  }

  return url.toString()
}

/**
 * Creates a queue message for a project or layer map render.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param kind Preview subject kind.
 * @param identifier Project or layer identifier.
 * @param hash Preview content hash.
 * @param token Optional internal map render token for protected payload routes.
 * @returns Queue payload for the map renderer worker.
 */
export const buildMapRenderJob = (
  publicOrigin: string | null | undefined,
  kind: MapRenderSubjectKind,
  identifier: string,
  hash: string,
  token?: string | null,
): MapRenderJob => ({
  kind,
  identifier,
  hash,
  sourceUrl: buildMapRenderUrl(publicOrigin, kind, identifier, token),
  targetObjectKey: buildMapRenderObjectKey({
    kind,
    identifier,
    hash,
  }),
})
