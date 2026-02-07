import {
  sqliteTable,
  foreignKey,
  text,
  integer,
  real,
  index,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Import other schemas for relations
import { project } from './project';
import { layer } from './layer';
import { property } from './property';
import { user } from './user';

/* ===================================================================
 * 1.  DEFINITION TABLE  –  “what should be calculated?”
 * =================================================================== */
export const leaderboard = sqliteTable(
  'leaderboard',
  {
    id: text('id')
      .$defaultFn(() => nanoid())
      .primaryKey(),

    /* ---- metric identity ---- */
    projectId: integer('project_id').notNull(),
    layerId: integer('layer_id').notNull(),
    propertyId: integer('property_id'),
    resourceType: text('resource_type', {
      enum: ['event', 'eventAttendance', 'feature']
    }).notNull(),
    aggregationField: text('aggregationField').notNull().default('value'), // 'value' for collectedAmount, 'hasAttended' for runs
    aggregation: text('aggregation', {
      enum: [
        'sum',
        'count',
        'countTrue',
        'countFalse',
        'countDistinct',
        'avg',
        'min',
        'max',
        'median'
      ]
    })
      .notNull()
      .default('sum'), // 'value' for collectedAmount, 'countTrue' for runs

    /* ---- time-scales that must be maintained ---- */
    timeFrame: text('timeFrame', { enum: ['year', 'month', 'date'] }), // Null for 'all-time'
    period: text('period'), // '2025', '2025-10', '2025-10-18' … NULL means it's ongoing or all-time

    /* ---- timestamps ---- */
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    modifiedAt: text('modified_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
  },
  (t) => [
    uniqueIndex('leaderboard_definition_unique_idx').on(
      t.projectId,
      t.layerId,
      t.propertyId,
      t.resourceType,
      t.aggregationField,
      t.aggregation,
      t.timeFrame,
      t.period
    ),
    index('leaderboard_project_idx').on(t.projectId),
    index('leaderboard_layer_idx').on(t.layerId),
    index('leaderboard_property_idx').on(t.propertyId),
    foreignKey({ columns: [t.projectId], foreignColumns: [project.id] }),
    foreignKey({ columns: [t.layerId], foreignColumns: [layer.id] }),
    foreignKey({ columns: [t.propertyId], foreignColumns: [property.id] })
  ]
);

/* ===================================================================
 * 2.  RESULT TABLE  –  “the numbers”
 * =================================================================== */
export const leaderboardRanking = sqliteTable(
  'leaderboardRanking',
  {
    leaderboardId: text('leaderboard_id').notNull(),
    userId: integer('user_id').notNull(),
    value: real('value').notNull(), // pre-aggregated value
    rank: integer('rank').notNull(), // 1 = top, dense rank
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    modifiedAt: text('modified_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
  },
  (t) => [
    index('leaderboardRanking_leaderboard_id_idx').on(t.leaderboardId),
    index('leaderboardRanking_user_id_idx').on(t.userId),
    uniqueIndex('leaderboardRanking_unique_idx').on(t.leaderboardId, t.userId),
    foreignKey({ columns: [t.leaderboardId], foreignColumns: [leaderboard.id] }),
    foreignKey({ columns: [t.userId], foreignColumns: [user.id] })
  ]
);

/* ===================================================================
 * 3.  RELATIONS  –  defined in relations.ts to avoid circular deps
 * =================================================================== */
// Relations for leaderboard and leaderboardRanking will be defined in relations.ts
// This file only defines the tables.
