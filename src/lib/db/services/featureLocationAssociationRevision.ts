// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// SCHEMA
import { feature } from '../schema/feature'
import { featureLocation } from '../schema/location'
import { property, propertyI18n } from '../schema/property'
import { hub } from '../schema/hub'
// DOMAIN
import { contentMapToStorage } from '#lib/i18n/contentRecords.js'
// SERVICES
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import {
  parseFeatureRevisionSource,
  buildFeatureRevisionBaselineContent,
} from './featureRevisionContent'
import { readFeatureLocationRevisionMemberships } from './featureLocationRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureLocationAssociationWrite } from './locationAssociation'
import type { materializeEffectiveLocation } from '#lib/locations/materialize.js'

/**
 * Captures an explicitly approved link/relink and its materialization with Feature history.
 * @param db Request database.
 * @param input Prepared association, optional deterministic projection and authorization fence.
 * @returns Statements enclosing the original Location transaction, including its corrections.
 * @remarks This is an accepted admin command, never proposal saving. It mirrors association
 * retention rules and verifies the resulting complete projection, so trigger/contract drift
 * rolls back corrections, memberships, content and publication receipts together.
 */
export async function prepareFeatureLocationAssociationCapture(
  db: Database,
  input: {
    association: FeatureLocationAssociationWrite
    version: string
    projection?: ReturnType<typeof materializeEffectiveLocation>
    guard: SQL
    preparedSharedCorrections?: readonly import('./locationShared').PreparedSharedCorrection[]
    /** Preserve existing Feature values for the trusted existing-Feature migration. */
    migration?: {
      acceptedLocation: import('#lib/locations/resolve.js').EffectiveLocationFacts
    }
  },
): Promise<Awaited<ReturnType<typeof prepareFeatureAcceptedCapture>>> {
  const association = input.association
  const capture = await prepareFeatureAcceptedCapture(db, {
    featureId: association.featureId,
    actorId: association.actorId,
    ...(input.migration
      ? { origin: 'migration' as const, revisionBoundary: true }
      : {}),
    guard: input.guard,
    preparedSharedCorrections: input.preparedSharedCorrections,
    acceptedLocation: input.migration?.acceptedLocation,
    reason: association.expectedRevision
      ? 'Feature reassociated with Location'
      : 'Feature linked to Location',
    derive: async (previous, source) => {
      const next = parseFeatureRevisionSource(source.snapshot)
      const current = next.location[0]
      if ((current?.version ?? null) !== association.expectedRevision)
        throw new Error('Accepted Feature association changed')
      const sameIdentity = current?.locationId === association.locationId
      // Initial inserts retain explicit nulls; updates use SQLite JSON merge semantics.
      const policy = association.acceptancePolicy
        ? association.expectedRevision === null
          ? association.acceptancePolicy
          : JSON.parse(
              (await db.get<{ value: string }>(sql`SELECT json_patch(
            ${JSON.stringify(sameIdentity ? (current?.acceptancePolicy ?? {}) : {})},${JSON.stringify(association.acceptancePolicy)}) AS value`))!
                .value,
            )
        : sameIdentity
          ? current.acceptancePolicy
          : null
      const link = {
        featureId: association.featureId,
        locationId: association.locationId,
        version: input.version,
        actorId: association.actorId,
        factsRevisionId: association.factsRevisionId,
        locationRevisionId: association.locationRevisionId,
        overrides: association.overrides,
        factsOrganisationRevision:
          association.factsOrganisationRevision === undefined
            ? (current?.factsOrganisationRevision ?? null)
            : association.factsOrganisationRevision,
        locationOrganisationRevision:
          association.locationOrganisationRevision === undefined
            ? (current?.locationOrganisationRevision ?? null)
            : association.locationOrganisationRevision,
        occupancyRevisionId:
          association.occupancyRevisionId === undefined
            ? sameIdentity
              ? current.occupancyRevisionId
              : null
            : association.occupancyRevisionId,
        addressRevisionId:
          association.addressRevisionId === undefined
            ? sameIdentity
              ? current.addressRevisionId
              : null
            : association.addressRevisionId,
        membershipRevisionIds:
          association.membershipRevisionIds ??
          (sameIdentity ? current.membershipRevisionIds : []),
        placementOverrides:
          association.placementOverrides ??
          (sameIdentity ? current.placementOverrides : {}),
        acceptedGeometry:
          association.acceptedGeometry ??
          (sameIdentity ? current.acceptedGeometry : null),
        acceptancePolicy: policy,
        acceptanceProposalId: association.acceptanceProposalId ?? null,
      }
      next.location = [z.record(z.string(), z.json()).parse(link)]
      // The new shared binding supersedes detached brand ownership; old revisions retain it.
      next.record.localLocationBrands = null
      if (input.projection) {
        next.record.geometry = z.json().parse(input.projection.data.geometry)
        next.record.addressMeta = z.json().parse(input.projection.data.addressMeta)
        for (const [locale, value] of Object.entries(
          contentMapToStorage(input.projection.i18n),
        )) {
          let row = next.translations.find(row => row.locale === locale)
          const existing = Boolean(row)
          if (!row) {
            row = {
              featureId: association.featureId,
              locale,
              title: '',
              titleGen: true,
              description: null,
              descriptionGen: true,
              displayAddress: null,
              displayAddressGen: true,
              addressProperties: null,
            }
            next.translations.push(row)
          }
          for (const key of [
            'title',
            'titleGen',
            'description',
            'descriptionGen',
            'displayAddress',
            'displayAddressGen',
            'addressProperties',
          ] as const) {
            if (
              policy?.nameMode === 'independent' &&
              (key === 'title' || (existing && key === 'titleGen'))
            )
              continue
            if (value[key] !== undefined) row[key] = z.json().parse(value[key])
          }
        }
        // The phone reset replaces only the universal phone answer and its locale children.
        const definitions = await db
          .select({ definition: property })
          .from(property)
          .innerJoin(hub, eq(hub.id, property.hubId))
          .where(
            and(
              eq(property.key, 'phoneNumber'),
              eq(property.scope, 'hub'),
              eq(hub.code, 'core'),
            ),
          )
        if (definitions.length !== 1)
          throw new Error('Universal phone property changed')
        const definition = definitions[0].definition
        if (!next.fieldDefinitions.some(row => row.id === definition.id)) {
          next.fieldDefinitions.push(z.record(z.string(), z.json()).parse(definition))
          next.fieldTranslations.push(
            ...(await db
              .select()
              .from(propertyI18n)
              .where(eq(propertyI18n.propertyId, definition.id))),
          )
        }
        next.properties = next.properties.filter(
          row => row.propertyId !== definition.id,
        )
        next.properties.push({
          featureId: association.featureId,
          propertyId: definition.id,
          propertyValueId: null,
          value: JSON.stringify(input.projection.phones ?? []),
          valueJson: null,
        })
        next.propertyTranslations = next.propertyTranslations.filter(
          row => row.propertyId !== definition.id,
        )
      }
      const content = buildFeatureRevisionBaselineContent(next, {
        revisions: Object.fromEntries(
          Object.entries(previous.gallery.entries).map(([id, entry]) => [
            id,
            entry.imageRevisionId,
          ]),
        ),
        order: previous.gallery.order,
      })
      content.gallery = previous.gallery
      content.placement.location!.memberships =
        await readFeatureLocationRevisionMemberships(db, content.placement.location!)
      return content
    },
  })
  if (input.migration) {
    capture.after.unshift(
      db
        .update(feature)
        .set({ localLocationBrands: null, modifiedAt: sql`${feature.modifiedAt}` })
        .where(sql`${feature.id}=${association.featureId}
        AND EXISTS(SELECT 1 FROM ${featureLocation} WHERE ${featureLocation.featureId}=${association.featureId} AND ${featureLocation.version}=${input.version})`),
    )
  } else if (capture.revisionId) {
    const now = new Date(
      Math.max(
        Date.now(),
        (Date.parse(association.expectedFeatureModifiedAt) || 0) + 1,
      ),
    ).toISOString()
    capture.after.unshift(
      db
        .update(feature)
        .set({ modifiedAt: now, localLocationBrands: null })
        .where(eq(feature.id, association.featureId)),
    )
  }
  return capture
}
