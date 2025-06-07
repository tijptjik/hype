// DRIZZLE
import { and, eq, exists, isNull, or, SQL } from 'drizzle-orm';
// SCHEMA
import { organisation, project, layer, feature, hub } from '$lib/db/schema';
// TYPES
import type { Database, HubOpts, HubDBRaw } from '$lib/types';

// ═══════════════════════
// HUB FILTERING FUNCTIONS
// ═══════════════════════

/**
 * Core filtering logic for organisations
 * - Core hub: shows orgs with no hubId OR orgs that are not hub-exclusive
 * - Specific hub: shows orgs assigned to this hub (via code OR domain match)
 */
export function getOrganisationHubFilter(
  db: Database,
  opts: { hubCode?: string; hubDomain?: string; isCore: boolean }
): SQL<unknown> | undefined {
  if (opts.isCore) {
    // Core shows: no hub assignment OR non-exclusive hub assignments
    return and(
      eq(organisation.isCoreInclusive, true),
      or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false))
    );
  } else {
    // Specific hub shows: assigned to this hub via code OR domain match
    const hubConditions: SQL<unknown>[] = [];

    if (opts.hubCode) {
      hubConditions.push(eq(hub.code, opts.hubCode));
    }

    if (opts.hubDomain) {
      hubConditions.push(eq(hub.domain, opts.hubDomain));
    }

    return exists(
      db
        .select()
        .from(hub)
        .where(
          and(
            eq(hub.id, organisation.hubId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions)
          )
        )
    );
  }
}

/**
 * Projects inherit filtering from their organisation
 */
export function getProjectHubFilter(
  db: Database,
  opts: { hubCode?: string; hubDomain?: string; isCore: boolean }
): SQL<unknown> | undefined {
  if (opts.isCore) {
    // Core: project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(organisation)
        .where(
          and(
            eq(organisation.id, project.organisationId),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false))
          )
        )
    );
  } else {
    // Specific hub: project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = [];

    if (opts.hubCode) {
      hubConditions.push(eq(hub.code, opts.hubCode));
    }

    if (opts.hubDomain) {
      hubConditions.push(eq(hub.domain, opts.hubDomain));
    }

    return exists(
      db
        .select()
        .from(organisation)
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(organisation.id, project.organisationId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions)
          )
        )
    );
  }
}

/**
 * Layers inherit filtering from project → organisation
 */
export function getLayerHubFilter(
  db: Database,
  opts: HubOpts
): SQL<unknown> | undefined {
  if (opts.isCore) {
    // Core: layer's project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(project)
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .where(
          and(
            eq(project.id, layer.projectId),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false))
          )
        )
    );
  } else {
    // Specific hub: layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = [];

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code));
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain));
    }

    return exists(
      db
        .select()
        .from(project)
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(project.id, layer.projectId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions)
          )
        )
    );
  }
}

/**
 * Features inherit filtering from layer → project → organisation
 */
export function getFeatureHubFilter(
  db: Database,
  opts: { hubCode?: string; hubDomain?: string; isCore: boolean }
): SQL<unknown> | undefined {
  if (opts.isCore) {
    // Core: feature's layer's project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(layer)
        .innerJoin(project, eq(project.id, layer.projectId))
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .where(
          and(
            eq(layer.id, feature.layerId),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false))
          )
        )
    );
  } else {
    // Specific hub: feature's layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = [];

    if (opts.hubCode) {
      hubConditions.push(eq(hub.code, opts.hubCode));
    }

    if (opts.hubDomain) {
      hubConditions.push(eq(hub.domain, opts.hubDomain));
    }

    return exists(
      db
        .select()
        .from(layer)
        .innerJoin(project, eq(project.id, layer.projectId))
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(layer.id, feature.layerId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions)
          )
        )
    );
  }
}

// ═══════════════════════
// CORE HUB OPERATIONS
// ═══════════════════════

export const listHubs = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
): Promise<HubDBRaw[]> =>
  await db.query.hub.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });

export const getHub = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
): Promise<HubDBRaw | undefined> =>
  await db.query.hub.findFirst({
    with: withRelations,
    where: and(...conditions)
  });
