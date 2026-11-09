// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { organisation } from './organisation'
import { location, locationRevision, organisationLocation } from './location'
// TYPES
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'

/** Immutable, independently reviewed Organisation Location correction candidate. */
export const locationCorrectionProposal = sqliteTable('locationCorrectionProposal', {
  id: text('id').primaryKey().notNull(),
  featureId: text('featureId')
    .notNull()
    .references(() => feature.id, { onDelete: 'restrict' }),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'restrict' }),
  locationId: text('locationId')
    .notNull()
    .references(() => location.id, { onDelete: 'restrict' }),
  associationVersion: text('associationVersion').notNull(),
  factsRevisionId: text('factsRevisionId')
    .notNull()
    .references(() => locationRevision.id),
  locationRevisionId: text('locationRevisionId')
    .notNull()
    .references(() => locationRevision.id),
  expectedOrganisationRevision: text('expectedOrganisationRevision').references(
    () => organisationLocation.revision,
  ),
  beforeOverrides: text('beforeOverrides', { mode: 'json' })
    .$type<FeatureLocationOverrides>()
    .notNull(),
  afterOverrides: text('afterOverrides', { mode: 'json' })
    .$type<FeatureLocationOverrides>()
    .notNull(),
  patch: text('patch', { mode: 'json' }).$type<FeatureLocationOverrides>().notNull(),
  beforeValues: text('beforeValues', { mode: 'json' })
    .$type<
      Pick<EffectiveLocationFacts, 'names' | 'phoneNumber' | 'brands'> &
        Partial<
          Pick<
            EffectiveLocationFacts,
            'websites' | 'socials' | 'accessibility' | 'location'
          >
        >
    >()
    .notNull(),
  afterValues: text('afterValues', { mode: 'json' })
    .$type<
      Pick<EffectiveLocationFacts, 'names' | 'phoneNumber' | 'brands'> &
        Partial<
          Pick<
            EffectiveLocationFacts,
            'websites' | 'socials' | 'accessibility' | 'location'
          >
        >
    >()
    .notNull(),
  actorId: text('actorId').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('createdAt').notNull(),
})

/** One immutable decision per proposal; retained history distinguishes author and reviewer. */
export const locationCorrectionDecision = sqliteTable('locationCorrectionDecision', {
  proposalId: text('proposalId')
    .primaryKey()
    .notNull()
    .references(() => locationCorrectionProposal.id),
  outcome: text('outcome', { enum: ['accepted', 'rejected'] }).notNull(),
  organisationRevision: text('organisationRevision').references(
    () => organisationLocation.revision,
  ),
  actorId: text('actorId').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('createdAt').notNull(),
})

/** Immutable selection of proposed fields accepted by a staff reviewer. */
export const locationCorrectionMerge = sqliteTable('locationCorrectionMerge', {
  proposalId: text('proposalId')
    .primaryKey()
    .notNull()
    .references(() => locationCorrectionProposal.id),
  patch: text('patch', { mode: 'json' }).$type<FeatureLocationOverrides>().notNull(),
  actorId: text('actorId').notNull(),
  createdAt: text('createdAt').notNull(),
})
