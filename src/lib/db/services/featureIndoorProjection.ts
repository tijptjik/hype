// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Project the source unit of a Feature's accepted current occupancy.
 * @returns A LandsD unit ID, or null when no accepted, accessible placement exists.
 * @remarks Apply only within independently authorized root Feature queries. Uses the
 * accepted revision rather than a newer occupancy head; source correlation survives publication.
 */
export function featureIndoorUnitSQL(): SQL<string | null> {
  return sql<string | null>`(SELECT substr(d.sourceKey,17)
    FROM featureLocation fp
    JOIN locationOccupancy o ON o.id=fp.occupancyRevisionId AND o.establishmentLocationId=fp.locationId
    JOIN location tenant ON tenant.id=fp.locationId
    JOIN location unit ON unit.id=o.containerLocationId
    JOIN locationCanonicalDraft d ON d.locationId=unit.id
    WHERE fp.featureId="feature"."id" AND "feature"."isDraft"=0
      AND o.assertionState='asserted' AND o.occupancyState='current'
      AND d.sourceKey LIKE 'landsd-mtr-unit:%'
      AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))
      AND (tenant.state!='manual' OR tenant.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId"))
      AND (unit.state!='manual' OR unit.ownerOrganisationId=(SELECT organisationId FROM project WHERE id="feature"."projectId")))`
}
