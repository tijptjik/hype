// TYPES
import type { PreviewAssetKind, PreviewRenderJob } from '../../types'
// HELPERS
import { buildPreviewObjectKey } from './storage.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. JOB URL HELPERS
//    - buildPreviewRenderUrl
//
// 2. JOB PAYLOAD HELPERS
//    - buildPreviewRenderJob

type PreviewJobSubjectKind = Exclude<PreviewAssetKind, 'styles'>

/**
 * Builds the canonical headless render URL for a project or layer preview.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param kind Preview subject kind.
 * @param identifier Project or layer identifier.
 * @param token Optional internal preview render token for protected payload routes.
 * @returns Fully qualified headless preview URL.
 */
export const buildPreviewRenderUrl = (
  publicOrigin: string | null | undefined,
  kind: PreviewJobSubjectKind,
  identifier: string,
  token?: string | null,
): string => {
  const url = new URL(
    `/headless/map-${kind === 'projects' ? 'project' : 'layer'}-preview/${identifier}`,
    publicOrigin ?? 'http://localhost:5173',
  )

  if (token) {
    url.searchParams.set('token', token)
  }

  return url.toString()
}

/**
 * Creates a queue message for a project or layer preview render.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param kind Preview subject kind.
 * @param identifier Project or layer identifier.
 * @param hash Preview content hash.
 * @param token Optional internal preview render token for protected payload routes.
 * @returns Queue payload for the preview renderer worker.
 */
export const buildPreviewRenderJob = (
  publicOrigin: string | null | undefined,
  kind: PreviewJobSubjectKind,
  identifier: string,
  hash: string,
  token?: string | null,
): PreviewRenderJob => ({
  kind,
  identifier,
  hash,
  sourceUrl: buildPreviewRenderUrl(publicOrigin, kind, identifier, token),
  targetObjectKey: buildPreviewObjectKey({
    kind,
    identifier,
    hash,
  }),
})
