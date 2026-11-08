// DRIZZLE
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// TYPES
import type { ImageDB, ImageDBNew } from '#lib/db/zod/schema/image.types.js'
import type { ResourceUploadSnapshot } from '#lib/images/uploadContext.js'
import type { LogoRevisionEvidence } from '#lib/db/services/resourceLogoRevision.js'

/** Verified assets awaiting attachment. Tombstones prevent confirmation from resurrecting canceled uploads. */
export const imageUpload = sqliteTable(
  'imageUpload',
  {
    imageId: text('imageId').primaryKey(),
    actorId: text('actorId').notNull(),
    ctxType: text('ctxType', {
      enum: ['user', 'project', 'organisation', 'hub'],
    }).notNull(),
    ctxId: text('ctxId').notNull(),
    state: text('state', { enum: ['pending', 'attached', 'discarded'] }).notNull(),
    expiresAt: integer('expiresAt').notNull(),
    data: text('data', { mode: 'json' }).$type<ImageDB & ImageDBNew>().notNull(),
    snapshot: text('snapshot', { mode: 'json' })
      .$type<ResourceUploadSnapshot>()
      .notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<LogoRevisionEvidence>(),
    selectedUrl: text('selectedUrl'),
  },
  table => [
    index('image_upload_expiry_idx').on(table.actorId, table.state, table.expiresAt),
  ],
)
