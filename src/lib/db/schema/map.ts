import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

import { supportedLocales } from '../../enums'
import { hub } from './hub'
import { organisation } from './organisation'
import { project } from './project'

export const mapStyles = sqliteTable('mapStyles', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  code: text('code').unique().notNull(),
  organisationId: text('organisationId').references(() => organisation.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  hubId: text('hubId').references(() => hub.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  previewImagePath: text('previewImagePath'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

export const mapStyleI18n = sqliteTable(
  'mapStyleI18n',
  {
    mapStyleId: text('mapStyleId')
      .notNull()
      .references(() => mapStyles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]],
    }).notNull(),
    name: text('name').notNull(),
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(false),
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [primaryKey({ columns: [table.mapStyleId, table.locale] })],
)

export const projectMapStyles = sqliteTable(
  'projectMapStyles',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    mapStyleId: text('mapStyleId')
      .notNull()
      .references(() => mapStyles.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
    modifiedAt: text('modifiedAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
      .notNull(),
  },
  table => [primaryKey({ columns: [table.projectId] })],
)
