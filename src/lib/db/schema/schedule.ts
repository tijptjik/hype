import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  index,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
// ENUM
import { supportedLocales } from '$lib/enums';

/* ============================================================================
 * SCHEDULE MANAGEMENT
 * ============================================================================
 * Tables for managing flexible repeating schedules for features, organisations, projects,
 * layers and places.
 * Supports: weekly hours, nth day-of-week schedules, public holidays, and special events
 * Precedence: exception → publicHoliday → nthDow → weekly
 */

/**
 * Schedule types that can have schedules attached
 */
export type ScheduleOwnerType = 'feature' | 'place';

/**
 * Time segment for schedule rules
 * Represents a time range within a day (e.g., 09:00-11:00)
 * Supports open-ended times (endTime can be null for "open until closed")
 */
export interface TimeSegment {
  startTime: string; // HH:MM format
  endTime: string | null; // HH:MM format or null for open-ended (no closing time)
}

/**
 * Base schedule table
 * Links schedules to their owners (features, organisations, projects, or layers)
 */
export const schedule = sqliteTable(
  'schedule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(12)),
    ownerType: text('ownerType', {
      enum: [
        'feature',
        'place'
      ]
    }).notNull(),
    ownerId: text('ownerId').notNull(),
    osmOpeningHours: text('osmOpeningHours'), // Stores the original OSM opening_hours string for parsing
    timezone: text('timezone').notNull().default('Asia/Hong_Kong'),
    isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
    modifiedAt: text('modifiedAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
      .notNull()
  },
  (table) => [
    index('schedule_owner_idx').on(table.ownerType, table.ownerId, table.isActive)
  ]
);

/**
 * Schedule rules
 * Stores rule definitions for weekly, nth day-of-week, and public holiday behaviour
 * Supports multiple time segments per rule (e.g., "09:00-11:00, 14:00-17:00")
 */
export const scheduleRule = sqliteTable(
  'scheduleRule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(12)),
    scheduleId: text('scheduleId')
      .notNull()
      .references(() => schedule.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ruleType: text('ruleType', { enum: ['weekly', 'nthDow', 'publicHoliday'] })
      .notNull()
      .default('weekly'),
    dayOfWeek: integer('dayOfWeek'), // Optional: required for weekly/nthDow rules, null for publicHoliday, Mon=1 ... Sun=7
    nth: integer('nth'), // For 'nthDow' rules: 1=1st, 2=2nd, ..., -1=last. Null for 'weekly' and 'publicHoliday' rules.
    timeSegments: text('timeSegments', { mode: 'json' }).$type<TimeSegment[]>(), // Optional - can be null when isClosed or is24Hours are true
    isClosed: integer('isClosed', { mode: 'boolean' }).notNull().default(false), // If true, location is closed this day
    is24Hours: integer('is24Hours', { mode: 'boolean' }).notNull().default(false), // If true, open 24 hours
    validFromMonth: integer('validFromMonth'), // Optional start month for this rule (1-12)
    validFromDay: integer('validFromDay'), // Optional start day for this rule (1-31)
    validFromYear: integer('validFromYear'), // Optional start year. If null, rule applies from the beginning of time.
    validUntilMonth: integer('validUntilMonth'), // Optional end month for this rule (1-12)
    validUntilDay: integer('validUntilDay'), // Optional end day for this rule (1-31)
    validUntilYear: integer('validUntilYear'), // Optional end year. If null, rule applies indefinitely.
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
    modifiedAt: text('modifiedAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
      .notNull()
  },
  (table) => [
    index('schedule_rule_day_idx').on(table.scheduleId, table.dayOfWeek),
    index('schedule_rule_type_idx').on(table.scheduleId, table.ruleType)
  ]
);

/**
 * Schedule rule translations
 * Stores multilingual content for individual schedule rules
 * Useful for seasonal schedules: "Winter Hours", "Summer Schedule", etc.
 */
export const scheduleRuleI18n = sqliteTable(
  'scheduleRuleI18n',
  {
    scheduleRuleId: text('scheduleRuleId')
      .notNull()
      .references(() => scheduleRule.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]]
    }).notNull(),
    // Full Name in {locale} (e.g., "Winter Hours", "Summer Schedule")
    name: text('name'),
    // Short Name in {locale}, used in navigation (e.g., "Winter", "Summer")
    nameShort: text('nameShort'),
    // Generation flags for AI-assisted translation
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [
    primaryKey({ columns: [table.scheduleRuleId, table.locale] })
  ]
);

/**
 * Exception date schedules (special one-off dates)
 * Stores schedules for specific dates that override all other rules
 * Used for holidays, special events, temporary closures, etc.
 */
export const scheduleException = sqliteTable(
  'scheduleException',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid(12)),
    scheduleId: text('scheduleId')
      .notNull()
      .references(() => schedule.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    exceptionDate: text('exceptionDate').notNull(), // Specific date in YYYY-MM-DD format
    exceptionType: text('exceptionType', {
      enum: ['holiday', 'event', 'closure', 'special_hours']
    })
      .notNull()
      .default('special_hours'),
    timeSegments: text('timeSegments', { mode: 'json' }).$type<TimeSegment[]>(), // Optional - can be null when isClosed or is24Hours is true
    isClosed: integer('isClosed', { mode: 'boolean' }).notNull().default(false),
    is24Hours: integer('is24Hours', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull()
  },
  (table) => [
    index('schedule_exception_date_idx').on(table.scheduleId, table.exceptionDate),
    uniqueIndex('schedule_exception_unique').on(table.scheduleId, table.exceptionDate)
  ]
);

/**
 * Schedule exception translations
 * Stores multilingual content for individual schedule exception rules
 * Useful for named special events: "Christmas Closure", "New Year's Event", etc.
 */
export const scheduleExceptionI18n = sqliteTable(
  'scheduleExceptionI18n',
  {
    scheduleExceptionId: text('scheduleExceptionId')
      .notNull()
      .references(() => scheduleException.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]]
    }).notNull(),
    // Full Name in {locale} (e.g., "Christmas Closure", "New Year's Event")
    name: text('name'),
    // Short Name in {locale}, used in navigation (e.g., "Xmas", "NYE")
    nameShort: text('nameShort'),
    // Generation flags for AI-assisted translation
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [
    primaryKey({ columns: [table.scheduleExceptionId, table.locale] })
  ]
);
