// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { ImageMetadataBasicSchema } from '#lib/db/zod/schema/image.js'
import { z } from 'zod'
// DOMAIN
import { diffRevisionValues } from '#lib/revisions/diff.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

const reviewMetadata = ImageMetadataBasicSchema.pick({
  credit: true,
  capturedAt: true,
  capture: true,
  rotation: true,
  originalWidth: true,
  originalHeight: true,
}).extend({ presentationMode: z.enum(['contain', 'cover']).optional() })

/**
 * Explains changed gallery pins with the authored image metadata a reviewer is accepting.
 * @param db Request database.
 * @param before Authorized comparison snapshot.
 * @param after Authorized candidate or publication snapshot.
 * @returns Changed presentation/credit/capture values; never arbitrary EXIF or object keys.
 * @remarks Call only after authorizing the owning Feature review/history. Both immutable
 * revisions must belong to the same gallery image. Binding count is independent of gallery size.
 */
export async function readFeatureImageMetadataChanges(
  db: Database,
  before: FeatureRevisionContent,
  after: FeatureRevisionContent,
): Promise<RevisionDifference[]> {
  const changes = Object.entries(after.gallery.entries).flatMap(([imageId, entry]) => {
    const previous = before.gallery.entries[imageId]
    return previous && previous.imageRevisionId !== entry.imageRevisionId
      ? [{ imageId, before: previous.imageRevisionId, after: entry.imageRevisionId }]
      : []
  })
  if (!changes.length) return []
  const rows = await db.all<{ imageId: string; before: string; after: string }>(sql`
    SELECT json_extract(j.value,'$.imageId') AS imageId,b.metadata AS before,a.metadata AS after
    FROM json_each(${JSON.stringify(changes)}) j
    JOIN imageRevision b ON b.id=json_extract(j.value,'$.before') AND b.imageId=json_extract(j.value,'$.imageId')
    JOIN imageRevision a ON a.id=json_extract(j.value,'$.after') AND a.imageId=b.imageId`)
  if (rows.length !== changes.length)
    throw new Error('Image review evidence is unavailable')
  return rows.flatMap(row =>
    diffRevisionValues(
      { present: true, value: reviewMetadata.parse(JSON.parse(row.before)) },
      { present: true, value: reviewMetadata.parse(JSON.parse(row.after)) },
    ).map(change => ({
      ...change,
      path: ['gallery', 'entries', row.imageId, 'metadata', ...change.path],
    })),
  )
}
