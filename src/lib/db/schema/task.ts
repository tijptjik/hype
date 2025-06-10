import {
  integer,
  primaryKey,
  sqliteTable,
  text
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
// ENUM
import {
  TaskType,
  TaskReviewOutcome,
  TaskReviewAction
} from '../../enums';

/* ============================================================================
 * TASK MANAGEMENT
 * ============================================================================
 * Tables for managing tasks and their associated images
 */

/**
 * Core task table
 * @remarks
 * Stores task information and metadata
 * - Task type (reportedMissing, newPhoto, newFeature)
 * - Organization, project, and feature references
 * - Contributor and reviewer references
 * - Review status and outcome
 */
export const task = sqliteTable('task', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  featureId: text('featureId').notNull(),
  contributorId: text('contributorId').notNull(),
  reviewerId: text('reviewerId'),
  type: text('type', {
    enum: Object.values(TaskType) as [string, ...string[]]
  }).notNull(),
  message: text('message'),
  isReviewed: integer('isReviewed', { mode: 'boolean' }).default(false).notNull(),
  reviewOutcome: text('reviewOutcome', {
    enum: Object.values(TaskReviewOutcome) as [string, ...string[]]
  }),
  reviewAction: text('reviewAction', {
    enum: Object.values(TaskReviewAction) as [string, ...string[]]
  }),
  reviewReason: text('reviewReason'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Task image assignments
 * @remarks
 * Links images to tasks
 */
export const taskImage = sqliteTable(
  'taskImage',
  {
    taskId: text('taskId')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    imageId: text('imageId').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.imageId] })
  ]
); 