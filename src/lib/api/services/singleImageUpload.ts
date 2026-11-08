// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// DB
import { user as userTable } from '#lib/db/schema/user.js'
import { getUserById } from '#lib/db/services/user.js'
import { toImageEnvelope } from '#lib/db/services/image.js'
import { createUploadedResourceImage } from '#lib/db/services/resourceImageUpload.js'
import { readResourceLogoHead } from '#lib/db/services/resourceLogoRevision.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { prepareUserImageAttachment } from '#lib/db/services/singleImageUpload.js'
// AUTHORIZATION / RESPONSE
import { adminUserEditCondition } from './authz/adminUser.js'
import { toResponseShapeProjectOrOrganisation } from './image.js'
// TYPES
import type { GuardedQueryContext } from '#lib/api/guarded.types.js'
import type { StagedImageUpload } from '#lib/db/services/singleImageUpload.js'
import type {
  ImageDBFlat,
  ImageContextEnvelope,
  ImageContextType,
} from '#lib/db/zod/schema/image.types.js'

/** Complete a single-image upload according to the form's explicit save behaviour.
 * @param ctx Authorized request context.
 * @param receipt Verified asset and original resource snapshot.
 * @param attachment Immediate selection or deferred form selection.
 * @returns Common image envelope for preview and attachment.
 */
export async function completeSingleImageUpload(
  ctx: GuardedQueryContext,
  receipt: StagedImageUpload,
  attachment: 'immediate' | 'deferred',
): Promise<ImageContextEnvelope<'detail'>> {
  let selected: ImageDBFlat = receipt.data
  if (attachment === 'immediate') {
    if (receipt.ctxType === 'user') {
      const plan = prepareUserImageAttachment(ctx.db, receipt, ctx.event.url.origin)
      const access = adminUserEditCondition(ctx.user)
      const result = await executeRevisionBatch(
        ctx.db,
        and(
          plan.guard,
          sql`EXISTS (SELECT 1 FROM ${userTable} WHERE ${userTable.id} = ${receipt.ctxId} AND ${access})`,
        )!,
        [
          ...(receipt.state === 'attached'
            ? []
            : [
                ...plan.before,
                ctx.db
                  .update(userTable)
                  .set({ image: plan.url, updatedAt: new Date() })
                  .where(eq(userTable.id, receipt.ctxId)),
                ...plan.after,
              ]),
        ],
      )
      if (!result) throw error(409, 'Profile image changed. Reload before saving.')
    } else {
      const saved = await createUploadedResourceImage(
        ctx.db,
        receipt.ctxType,
        receipt.ctxId,
        receipt.data,
        receipt.snapshot,
        receipt.imageId,
        { actorId: ctx.user.id, reason: 'Resource image updated' },
        receipt.evidence ?? undefined,
        receipt,
      )
      if (!saved) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
      selected = saved
    }
  }
  const contributor = await getUserById(ctx.db, receipt.actorId)
  const response = await toResponseShapeProjectOrOrganisation(
    selected,
    contributor?.attribution ?? undefined,
  )
  if (attachment === 'immediate' && receipt.ctxType !== 'user') {
    const head = await readResourceLogoHead(ctx.db, selected.id)
    if (head) Object.assign(response, { imageRevisionId: head.imageRevisionId })
  }
  return toImageEnvelope(
    response,
    'detail',
    receipt.ctxType as ImageContextType,
    receipt.ctxId,
  )
}
