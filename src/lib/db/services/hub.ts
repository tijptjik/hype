// DRIZZLE
import { and, eq, exists, isNull, or, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  organisation,
  project,
  layer,
  feature,
  hub,
  hubRole,
  hubI18n,
  task,
  featureImage,
  image,
} from '$lib/db/schema/index'
// DB
import { toRelatedRecords } from '..'
import { insertManyRelated, replaceManyRelated } from '../crud'
import { updateOrganisationById } from './organisation'
// TYPES
import type {
  Database,
  HubDBRaw,
  HubDB,
  HubDBPartial,
  Code,
  Locale,
  HubOptsExtended,
  HubI18nNew,
  HubI18nDB,
  HubI18nPartial,
} from '$lib/types'
import { hubEntityWithRelations } from '$lib/api/services/hub'

// ═══════════════════════
// HUB FILTERING FUNCTIONS
// ═══════════════════════

/**
 * Core filtering logic for organisations
 * - Core hub: shows orgs with no hubId OR orgs that are not hub-exclusive
 * - Specific hub: shows orgs assigned to this hub (via code OR domain match)
 * - SuperAdmins: bypass filtering entirely (return undefined)
 */
export function getOrganisationHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }

  if (opts.isCore) {
    // Core shows: no hub assignment OR non-exclusive hub assignments
    return and(
      eq(organisation.isCoreInclusive, true),
      or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
    )
  } else {
    // Specific hub shows: assigned to this hub via code OR domain match
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
    }

    return exists(
      db
        .select()
        .from(hub)
        .where(
          and(
            eq(hub.id, organisation.hubId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

/**
 * Projects inherit filtering from their organisation
 */
export function getProjectHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }
  if (opts.isCore) {
    // Core: project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(organisation)
        .where(
          and(
            eq(organisation.id, project.organisationId),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
          ),
        ),
    )
  } else {
    // Specific hub: project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
    }

    return exists(
      db
        .select()
        .from(organisation)
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(organisation.id, project.organisationId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

/**
 * Layers inherit filtering from project → organisation
 */
export function getLayerHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }
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
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
          ),
        ),
    )
  } else {
    // Specific hub: layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
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
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

/**
 * Features inherit filtering from layer → project → organisation
 */
export function getFeatureHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }
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
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
          ),
        ),
    )
  } else {
    // Specific hub: feature's layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
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
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

/**
 * Images inherit filtering from featureImage → feature → layer → project → organisation
 */
export function getImageHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }
  if (opts.isCore) {
    // Core: image's feature's layer's project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(featureImage)
        .innerJoin(feature, eq(featureImage.featureId, feature.id))
        .innerJoin(layer, eq(feature.layerId, layer.id))
        .innerJoin(project, eq(layer.projectId, project.id))
        .innerJoin(organisation, eq(project.organisationId, organisation.id))
        .where(
          and(
            eq(featureImage.imageId, image.id),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
          ),
        ),
    )
  } else {
    // Specific hub: image's feature's layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
    }

    return exists(
      db
        .select()
        .from(featureImage)
        .innerJoin(feature, eq(featureImage.featureId, feature.id))
        .innerJoin(layer, eq(feature.layerId, layer.id))
        .innerJoin(project, eq(layer.projectId, project.id))
        .innerJoin(organisation, eq(project.organisationId, organisation.id))
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(featureImage.imageId, image.id),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

/**
 * Tasks inherit filtering from feature → layer → project → organisation
 */
export function getTaskHubFilter(
  db: Database,
  opts: HubOptsExtended,
): SQL<unknown> | undefined {
  // SuperAdmins bypass all hub filtering on Admin Panel
  if (opts.isSuperAdmin && opts.isAdminRequest) {
    return undefined
  }
  if (opts.isCore) {
    // Core: task's feature's layer's project's org has no hub OR org is not hub-exclusive
    return exists(
      db
        .select()
        .from(feature)
        .innerJoin(layer, eq(layer.id, feature.layerId))
        .innerJoin(project, eq(project.id, layer.projectId))
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .where(
          and(
            eq(feature.id, task.featureId),
            or(isNull(organisation.hubId), eq(organisation.isHubExclusive, false)),
          ),
        ),
    )
  } else {
    // Specific hub: task's feature's layer's project's org belongs to this hub
    const hubConditions: SQL<unknown>[] = []

    if (opts.code) {
      hubConditions.push(eq(hub.code, opts.code))
    }

    if (opts.domain) {
      hubConditions.push(eq(hub.domain, opts.domain))
    }

    return exists(
      db
        .select()
        .from(feature)
        .innerJoin(layer, eq(layer.id, feature.layerId))
        .innerJoin(project, eq(project.id, layer.projectId))
        .innerJoin(organisation, eq(organisation.id, project.organisationId))
        .innerJoin(hub, eq(organisation.hubId, hub.id))
        .where(
          and(
            eq(feature.id, task.featureId),
            hubConditions.length === 1 ? hubConditions[0] : or(...hubConditions),
          ),
        ),
    )
  }
}

// ═══════════════════════
// CORE HUB OPERATIONS
// ═══════════════════════

export const listHubs = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<HubDBRaw[]> =>
  await db.query.hub.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })

export const getHub = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<HubDBRaw | undefined> =>
  await db.query.hub.findFirst({
    with: withRelations,
    where: and(...conditions),
  })

export const createHub = async (db: Database, data: any): Promise<HubDB> => {
  const [created] = await db.insert(hub).values(data).returning()
  return created
}

export const updateHub = async (
  db: Database,
  data: HubDBPartial,
  code: Code,
): Promise<HubDBRaw> => {
  const [updated] = await db.update(hub).set(data).where(eq(hub.code, code)).returning()
  return updated
}

const toPersistedHubUserRoles = (
  userRoles: Array<{ userId: string; role: string }>,
  hubId: string,
) =>
  userRoles.map(userRole => ({
    hubId,
    userId: userRole.userId,
    role: userRole.role,
  }))

export const createHubUserRoles = async (
  db: Parameters<typeof createHub>[0],
  roles: Array<{ userId: string; role: string }>,
  hubId: string,
): Promise<void> => {
  if (roles.length === 0) return
  await db.insert(hubRole).values(toPersistedHubUserRoles(roles, hubId))
}

export const updateHubUserRoles = async (
  db: Parameters<typeof createHub>[0],
  roles: Array<{ userId: string; role: string }>,
  hubId: string,
): Promise<void> => {
  await db.delete(hubRole).where(eq(hubRole.hubId, hubId))
  if (roles.length === 0) return
  await db.insert(hubRole).values(toPersistedHubUserRoles(roles, hubId))
}

export const syncHubOrganisations = async (
  db: Parameters<typeof createHub>[0],
  hubId: string,
  nextRows: Array<{
    organisationId: string
    isCoreInclusive: boolean
    isHubExclusive: boolean
  }>,
): Promise<void> => {
  const currentAssignments = await db
    .select({ id: organisation.id })
    .from(organisation)
    .where(eq(organisation.hubId, hubId))

  if (currentAssignments.length > 0) {
    await Promise.all(
      currentAssignments.map(row =>
        updateOrganisationById(
          db,
          {
            hubId: null,
            isCoreInclusive: true,
            isHubExclusive: false,
          },
          row.id,
        ),
      ),
    )
  }

  if (nextRows.length === 0) return

  await Promise.all(
    nextRows.map(row =>
      updateOrganisationById(
        db,
        {
          hubId,
          isCoreInclusive: row.isCoreInclusive,
          isHubExclusive: row.isHubExclusive,
        },
        row.organisationId,
      ),
    ),
  )
}

// ═══════════════════════
// HUB I18N OPERATIONS
// ═══════════════════════

/**
 * Creates relational i18n records for a hub
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param hubId - The ID of the hub
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, HubI18nNew>,
  hubId: string,
): Promise<HubI18nDB[]> => {
  return await insertManyRelated(
    db,
    hubI18n,
    toRelatedRecords(i18n, 'hubId', hubId, 'locale') as any,
    'hubId',
    hubId,
  )
}

/**
 * Updates translations for a hub by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param hubId - The ID of the hub
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, HubI18nPartial>,
  hubId: string,
): Promise<HubI18nDB[]> => {
  return await replaceManyRelated(
    db,
    hubI18n,
    toRelatedRecords(i18n, 'hubId', hubId, 'locale') as any,
    hubI18n.hubId,
    hubId,
  )
}

// ═══════════════════════
// HUB ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new hub with translations
 * @param db - The database instance
 * @param data - The hub data to create
 * @returns The newly created hub with i18n data
 */
export const createHubWithRelated = async (
  db: Database,
  data: any, // Using any to avoid complex type issues
) => {
  const hub = await createHub(db, data)

  // Create i18n if provided
  let i18n: HubI18nDB[] = []
  if (data.i18n) {
    i18n = await createI18n(db, data.i18n, hub.id)
  }

  // Initialize organisations as empty array (will be assigned later if needed)
  const organisations: any[] = []

  const result = { ...hub, i18n, organisations }

  return result
}

/**
 * Updates a hub with translations
 * @param db - The database instance
 * @param data - The hub data to update
 * @param lookupCode - Optional code to lookup the hub (defaults to data.code)
 * @returns The updated hub with related data
 */
export const updateHubWithRelated = async (
  db: Database,
  data: any, // Using any to avoid complex type issues
  lookupCode?: string,
) => {
  const codeToUse = lookupCode || data.code
  const hub = await updateHub(db, data, codeToUse)

  // Update i18n if provided
  if (data.i18n) {
    await updateI18n(db, data.i18n, hub.id)
  }

  return hub
}

// ═══════════════════════
// HUB CODE UTILITIES
// ═══════════════════════

/**
 * Get hub code for an organisation by organisation ID
 */
export const getHubCodeForOrganisation = async (
  db: Database,
  organisationId: string,
): Promise<string | null> => {
  const result = await db
    .select({ hubCode: hub.code })
    .from(organisation)
    .leftJoin(hub, eq(organisation.hubId, hub.id))
    .where(eq(organisation.id, organisationId))
    .limit(1)

  return result[0]?.hubCode || null
}

/**
 * Get hub code for a project through its organisation
 */
export const getHubCodeForProject = async (
  db: Database,
  projectId: string,
): Promise<string | null> => {
  const result = await db
    .select({ hubCode: hub.code })
    .from(project)
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .leftJoin(hub, eq(organisation.hubId, hub.id))
    .where(eq(project.id, projectId))
    .limit(1)

  return result[0]?.hubCode || null
}

/**
 * Get hub code for a layer through project → organisation
 */
export const getHubCodeForLayer = async (
  db: Database,
  layerId: string,
): Promise<string | null> => {
  const result = await db
    .select({ hubCode: hub.code })
    .from(layer)
    .innerJoin(project, eq(layer.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .leftJoin(hub, eq(organisation.hubId, hub.id))
    .where(eq(layer.id, layerId))
    .limit(1)

  return result[0]?.hubCode || null
}

/**
 * Get hub code for a feature through layer → project → organisation
 */
export const getHubCodeForFeature = async (
  db: Database,
  featureId: string,
): Promise<string | null> => {
  const result = await db
    .select({ hubCode: hub.code })
    .from(feature)
    .innerJoin(layer, eq(feature.layerId, layer.id))
    .innerJoin(project, eq(layer.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .leftJoin(hub, eq(organisation.hubId, hub.id))
    .where(eq(feature.id, featureId))
    .limit(1)

  return result[0]?.hubCode || null
}

/**
 * Get hub code for a task through its organisation (direct relationship)
 */
export const getHubCodeForTask = async (
  db: Database,
  taskId: string,
): Promise<string | null> => {
  const result = await db
    .select({ hubCode: hub.code })
    .from(task)
    .innerJoin(organisation, eq(task.organisationId, organisation.id))
    .leftJoin(hub, eq(organisation.hubId, hub.id))
    .where(eq(task.id, taskId))
    .limit(1)

  return result[0]?.hubCode || null
}

export const getHubByCode = async (
  db: Database,
  code: string,
): Promise<HubDBRaw | undefined> =>
  await db.query.hub.findFirst({
    with: hubEntityWithRelations,
    where: eq(hub.code, code),
  })

export const getHubByDomain = async (
  db: Database,
  domain: string,
): Promise<HubDBRaw | undefined> =>
  await db.query.hub.findFirst({
    with: hubEntityWithRelations,
    where: eq(hub.domain, domain),
  })

export const getHubs = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<HubDBRaw[]> =>
  await db.query.hub.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
