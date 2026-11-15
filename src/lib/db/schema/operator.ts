// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location } from './location'

/** Operating bodies may be companies, public departments or other organisations. */
export const operator = sqliteTable('operator', {
  id: text('id').primaryKey(),
  logo: text('logo'),
  website: text('website'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
})

/** Localized operator names are independent of catalogue brand/group translations. */
export const operatorI18n = sqliteTable(
  'operatorI18n',
  {
    operatorId: text('operatorId')
      .notNull()
      .references(() => operator.id, { onDelete: 'restrict' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
  },
  table => [primaryKey({ columns: [table.operatorId, table.locale] })],
)

/** Explicit current operator; never inferred from containment or used to grant access. */
export const locationOperator = sqliteTable(
  'locationOperator',
  {
    locationId: text('locationId')
      .primaryKey()
      .references(() => location.id, { onDelete: 'restrict' }),
    operatorId: text('operatorId')
      .notNull()
      .references(() => operator.id, { onDelete: 'restrict' }),
    referenceCode: text('referenceCode'),
    createdBy: text('createdBy').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    check(
      'location_operator_code',
      sql`${table.referenceCode} IS NULL OR (length(trim(${table.referenceCode}))>0 AND ${table.referenceCode}=trim(${table.referenceCode}))`,
    ),
    index('location_operator_operator').on(table.operatorId),
    uniqueIndex('location_operator_reference').on(
      table.operatorId,
      table.referenceCode,
    ),
  ],
)

/** A Location's explicit maintained map reference; availability is derived from the registry. */
export const locationPremisesMap = sqliteTable('locationPremisesMap', {
  locationId: text('locationId')
    .primaryKey()
    .references(() => location.id, { onDelete: 'restrict' }),
  mapId: text('mapId').notNull().unique(),
  createdBy: text('createdBy').notNull(),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
})
