/** Saved publication intent; the server resolves ancestry and authorizes every read. */
export type PublicationPreview = {
  type: 'organisation' | 'project' | 'layer'
  id: string
  publishChildren: boolean
}

/**
 * Creates a map URL for a saved publication choice.
 * @param preview Resource and descendant publication choice.
 * @returns A local URL with explicit preview intent, never an access credential.
 */
export function publicationPreviewUrl(preview: PublicationPreview): string {
  const params = new URLSearchParams({
    previewType: preview.type,
    previewId: preview.id,
    previewChildren: String(preview.publishChildren),
  })
  return `/?${params}`
}

/**
 * Reads explicit preview intent without granting any access.
 * @param params Current map URL parameters.
 * @returns Valid preview intent or null when preview is absent.
 * @remarks Malformed intent fails closed rather than silently opening a public map.
 */
export function parsePublicationPreview(
  params: Pick<URLSearchParams, 'get' | 'has'>,
): PublicationPreview | null {
  if (!['previewType', 'previewId', 'previewChildren'].some(key => params.has(key)))
    return null
  const type = params.get('previewType')
  const id = params.get('previewId')
  const children = params.get('previewChildren')
  if (
    (type !== 'organisation' && type !== 'project' && type !== 'layer') ||
    !id?.trim() ||
    id.length > 128 ||
    (children !== 'true' && children !== 'false')
  )
    throw new Error('INVALID_PUBLICATION_PREVIEW')
  return { type, id, publishChildren: children === 'true' }
}
