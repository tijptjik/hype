// DRIZZLE
import { sql } from 'drizzle-orm'
// IMAGES
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

/** Extract an exact logo reference from an already authorized resource snapshot.
 * @param snapshot Historical resource content.
 * @returns Image and revision identities, or null when no exact evidence exists.
 */
function logoPin(
  snapshot: unknown,
): { imageId: string; imageRevisionId: string } | null {
  if (!snapshot || typeof snapshot !== 'object' || !('logo' in snapshot)) return null
  const logo = snapshot.logo
  if (
    !logo ||
    typeof logo !== 'object' ||
    !('imageId' in logo) ||
    typeof logo.imageId !== 'string' ||
    !('imageRevisionId' in logo) ||
    typeof logo.imageRevisionId !== 'string'
  )
    return null
  return { imageId: logo.imageId, imageRevisionId: logo.imageRevisionId }
}

/** Compare display modes and rotations retained by the exact before/after logo revisions.
 * @param db Request database with image revision storage installed.
 * @param before Authorized previous resource snapshot.
 * @param after Authorized current resource snapshot.
 * @returns Display differences only when both revisions retain known evidence.
 * @remarks Never reads the mutable image head, invents legacy defaults, or exposes other metadata.
 */
export async function readResourceLogoChanges(
  db: Database,
  before: unknown,
  after: unknown,
): Promise<RevisionDifference[]> {
  const previous = logoPin(before)
  const current = logoPin(after)
  if (!previous || !current || previous.imageRevisionId === current.imageRevisionId)
    return []
  // Match both identities so a revision cannot supply another image's metadata.
  const modes = await db.get<{
    beforeMode: string | null
    afterMode: string | null
    beforeRotation: number | null
    afterRotation: number | null
  }>(sql`
    SELECT json_extract(b.metadata,'$.presentationMode') AS beforeMode,
      json_extract(a.metadata,'$.presentationMode') AS afterMode,
      json_extract(b.metadata,'$.rotation') AS beforeRotation,
      json_extract(a.metadata,'$.rotation') AS afterRotation
    FROM imageRevision b JOIN imageRevision a
    WHERE b.id=${previous.imageRevisionId} AND b.imageId=${previous.imageId}
      AND a.id=${current.imageRevisionId} AND a.imageId=${current.imageId}`)
  if (!modes) return []
  const changes: RevisionDifference[] = []
  if (
    modes.beforeMode !== modes.afterMode &&
    IMAGE_PRESENTATION_MODES.some(mode => mode === modes.beforeMode) &&
    IMAGE_PRESENTATION_MODES.some(mode => mode === modes.afterMode)
  )
    changes.push({
      path: ['logo', 'presentationMode'],
      before: { present: true, value: modes.beforeMode },
      after: { present: true, value: modes.afterMode },
    })
  // Missing legacy rotation evidence stays unknown rather than being invented as zero.
  if (
    modes.beforeRotation !== modes.afterRotation &&
    [0, 90, 180, 270].some(value => value === modes.beforeRotation) &&
    [0, 90, 180, 270].some(value => value === modes.afterRotation)
  )
    changes.push({
      path: ['logo', 'rotation'],
      before: { present: true, value: modes.beforeRotation },
      after: { present: true, value: modes.afterRotation },
    })
  return changes
}
