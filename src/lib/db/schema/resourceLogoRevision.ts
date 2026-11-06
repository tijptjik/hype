// DRIZZLE
import { foreignKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { image } from './image'
import { imageRevision } from './imageRevision'
import { organisationRevision } from './organisationRevision'
import { projectRevision } from './projectRevision'
import { hubRevision } from './hubRevision'

/** Mutable selection; immutable logo references are attached to resource revisions. */
export const resourceLogoImageHead = sqliteTable(
  'resourceLogoImageHead',
  {
    imageId: text('imageId')
      .primaryKey()
      .references(() => image.id, { onDelete: 'restrict' }),
    imageRevisionId: text('imageRevisionId').notNull(),
  },
  t => [
    foreignKey({
      columns: [t.imageId, t.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
  ],
)

/** Exact organisation logo captured by the snapshot insert trigger. */
export const organisationRevisionLogo = sqliteTable(
  'organisationRevisionLogo',
  {
    revisionId: text('revisionId')
      .primaryKey()
      .references(() => organisationRevision.id, { onDelete: 'restrict' }),
    imageId: text('imageId').notNull(),
    imageRevisionId: text('imageRevisionId').notNull(),
  },
  t => [
    foreignKey({
      columns: [t.imageId, t.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
  ],
)
/** Exact project logo captured by the snapshot insert trigger. */
export const projectRevisionLogo = sqliteTable(
  'projectRevisionLogo',
  {
    revisionId: text('revisionId')
      .primaryKey()
      .references(() => projectRevision.id, { onDelete: 'restrict' }),
    imageId: text('imageId').notNull(),
    imageRevisionId: text('imageRevisionId').notNull(),
  },
  t => [
    foreignKey({
      columns: [t.imageId, t.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
  ],
)
/** Exact hub logo captured by the snapshot insert trigger. */
export const hubRevisionLogo = sqliteTable(
  'hubRevisionLogo',
  {
    revisionId: text('revisionId')
      .primaryKey()
      .references(() => hubRevision.id, { onDelete: 'restrict' }),
    imageId: text('imageId').notNull(),
    imageRevisionId: text('imageRevisionId').notNull(),
  },
  t => [
    foreignKey({
      columns: [t.imageId, t.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
  ],
)
