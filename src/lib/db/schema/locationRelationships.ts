// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location, featureLocation } from './location'
import { organisation } from './organisation'
// TYPES
import type { RelationshipEvidence } from '#lib/locations/relationships.js'
import type { Point } from 'geojson'

export const address = sqliteTable('address', {
  id: text('id').primaryKey(),
  sourceKey: text('sourceKey', { mode: 'json' })
    .$type<{ provider: string; family: string; id: string }>()
    .notNull(),
})
export const addressRevision = sqliteTable(
  'addressRevision',
  {
    id: text('id').primaryKey(),
    addressId: text('addressId')
      .notNull()
      .references(() => address.id),
    scope: text('scope', {
      enum: [
        'unknown',
        'premises',
        'phase',
        'building',
        'section',
        'floor',
        'unit',
        'unit_portion',
      ],
    }).notNull(),
    components: text('components', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    geometry: text('geometry', { mode: 'json' }).$type<Point>(),
    sourceVersion: text('sourceVersion'),
    contentHash: text('contentHash').notNull(),
    sourceReferences: text('sourceReferences', { mode: 'json' })
      .$type<
        {
          provider: string
          dataset: string
          apiVersion: string | null
          releaseId: string | null
          snapshotId: string | null
        }[]
      >()
      .notNull(),
    rawSource: text('rawSource', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  t => [uniqueIndex('address_revision_content').on(t.addressId, t.contentHash)],
)

/** Construct independent column builders for each immutable assertion table.
 * @returns Common evidence, scope and date columns; SQL migration enforces chain invariants.
 */
function assertionColumns() {
  return {
    id: text('id').primaryKey(),
    previousRevisionId: text('previousRevisionId'),
    scopeOrganisationId: text('scopeOrganisationId').references(() => organisation.id),
    assertionState: text('assertionState', {
      enum: ['asserted', 'suppressed'],
    }).notNull(),
    evidence: text('evidence', { mode: 'json' })
      .$type<RelationshipEvidence[]>()
      .notNull(),
    observedAt: text('observedAt'),
    verifiedAt: text('verifiedAt'),
    effectiveFrom: text('effectiveFrom'),
    effectiveTo: text('effectiveTo'),
    effectiveFromPrecision: text('effectiveFromPrecision', {
      enum: ['day', 'month', 'year', 'decade'],
    }),
    effectiveToPrecision: text('effectiveToPrecision', {
      enum: ['day', 'month', 'year', 'decade'],
    }),
    provenance: text('provenance', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    actorId: text('actorId'),
    recordedAt: text('recordedAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  }
}
export const locationAddress = sqliteTable('locationAddress', {
  ...assertionColumns(),
  relationshipId: text('relationshipId').notNull(),
  locationId: text('locationId')
    .notNull()
    .references(() => location.id),
  addressRevisionId: text('addressRevisionId')
    .notNull()
    .references(() => addressRevision.id),
  priority: integer('priority'),
  addressState: text('addressState', {
    enum: ['current', 'former', 'unconfirmed'],
  }).notNull(),
})
export const locationMembership = sqliteTable('locationMembership', {
  ...assertionColumns(),
  relationshipId: text('relationshipId').notNull(),
  childLocationId: text('childLocationId')
    .notNull()
    .references(() => location.id),
  parentLocationId: text('parentLocationId')
    .notNull()
    .references(() => location.id),
  membershipState: text('membershipState', {
    enum: ['current', 'former', 'unconfirmed'],
  }).notNull(),
})
export const locationOccupancy = sqliteTable('locationOccupancy', {
  ...assertionColumns(),
  relationshipId: text('relationshipId').notNull(),
  establishmentLocationId: text('establishmentLocationId')
    .notNull()
    .references(() => location.id),
  containerLocationId: text('containerLocationId').references(() => location.id),
  addressRevisionId: text('addressRevisionId').references(() => addressRevision.id),
  occupancyState: text('occupancyState', {
    enum: ['current', 'former', 'unconfirmed'],
  }).notNull(),
})
export const locationTransition = sqliteTable('locationTransition', {
  ...assertionColumns(),
  transitionId: text('transitionId').notNull(),
  type: text('type', {
    enum: ['replacement', 'merge', 'split', 'reconfiguration'],
  }).notNull(),
  basis: text('basis', { enum: ['real_world', 'identity_correction'] }).notNull(),
})
export const locationTransitionParticipant = sqliteTable(
  'locationTransitionParticipant',
  {
    transitionRevisionId: text('transitionRevisionId')
      .notNull()
      .references(() => locationTransition.id),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
    side: text('side', { enum: ['before', 'after'] }).notNull(),
  },
  t => [primaryKey({ columns: [t.transitionRevisionId, t.locationId, t.side] })],
)
export const featureLocationMembership = sqliteTable(
  'featureLocationMembership',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => featureLocation.featureId, { onDelete: 'cascade' }),
    containerLocationId: text('containerLocationId')
      .notNull()
      .references(() => location.id),
    role: text('role', { enum: ['building', 'premises'] }).notNull(),
    bindingVersion: text('bindingVersion').notNull(),
    occupancyRevisionId: text('occupancyRevisionId').references(
      () => locationOccupancy.id,
    ),
    membershipRevisionId: text('membershipRevisionId').references(
      () => locationMembership.id,
    ),
  },
  t => [primaryKey({ columns: [t.featureId, t.containerLocationId, t.role] })],
)

export const locationRelationshipOperation = sqliteTable(
  'locationRelationshipOperation',
  {
    id: text('id').primaryKey(),
    scopeOrganisationId: text('scopeOrganisationId').references(() => organisation.id),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
    rawSource: text('rawSource').notNull(),
    recordedAt: text('recordedAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
)
