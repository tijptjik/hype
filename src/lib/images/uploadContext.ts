/** Resource state captured before granting a single-resource upload. */
export type ResourceUploadSnapshot = {
  imageId: string | null
  modifiedAt: string
  organisationId: string | null
  hubId: string | null
}

/**
 * Validates authenticated resource snapshot claims.
 * @param value Untrusted decoded snapshot.
 * @returns Whether the snapshot contains all required state fields.
 */
export function isResourceUploadSnapshot(
  value: unknown,
): value is ResourceUploadSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.modifiedAt === 'string' &&
    row.modifiedAt.length > 0 &&
    ['imageId', 'organisationId', 'hubId'].every(
      key => row[key] === null || (typeof row[key] === 'string' && row[key].length > 0),
    )
  )
}

/** Persisted image identity and scope captured before authorizing a mutation. */
export type ImageMutationSnapshot = {
  imageId: string
  imageRevision: string
  assignmentRevision?: string | null
  scope: string
  source?: { publicId: string; env: string; version: number | null }
}

/**
 * Validates signed replacement snapshot claims.
 * @param value Authenticated but untrusted decoded snapshot.
 * @returns Whether all snapshot identities are nonempty strings.
 */
export function isImageMutationSnapshot(
  value: unknown,
): value is ImageMutationSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const source = row.source as Record<string, unknown> | undefined
  return (
    ['imageId', 'imageRevision', 'scope'].every(
      key => typeof row[key] === 'string' && row[key].length > 0,
    ) &&
    (row.assignmentRevision === undefined ||
      row.assignmentRevision === null ||
      (typeof row.assignmentRevision === 'string' &&
        row.assignmentRevision.length > 0)) &&
    (source === undefined ||
      (source !== null &&
        typeof source === 'object' &&
        typeof source.publicId === 'string' &&
        source.publicId.length > 0 &&
        typeof source.env === 'string' &&
        source.env.length > 0 &&
        (source.version === null ||
          (typeof source.version === 'number' &&
            Number.isSafeInteger(source.version)))))
  )
}
