// INDEX QUERY
import {
  resourceIndexFilterConditions,
  resourceIndexSearchCondition,
} from './resourceIndexFilters.js'
import type { ResourceIndexFilters } from '#lib/resources/indexQuery.js'
// ROLE POLICY
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
// ROLE PROVENANCE
import { prepareOrganisationStaffRoles } from './organisationRoleGrants.js'
import { prepareOrganisationUserPolicy } from './organisationUserPolicy.js'
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'
import { gt } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// DRIZZLE
import { and, eq, exists, like, sql, or } from 'drizzle-orm'
// CAPABILITY PERSISTENCE
import { buildOrganisationCapabilityCascade } from './capabilityCascade.js'
// PUBLICATION
import { buildDescendantPublication } from './publication.js'
// SCHEMA
import {
  feature,
  layer,
  organisation,
  organisationI18n,
  organisationRole,
  project,
} from '../schema'
// SERVICES
import {
  firstOrNull,
  resolveRequiredProbe,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
} from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { getOrganisationHubFilter } from './hub'
import { prepareGuardedReplacement } from './guardedReplacement.js'
import { preparePropertyCatalog } from './property.js'
import { prepareAdminResourceRevisionCapture } from './adminResourceRevision.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import {
  prepareOrganisationRevisionCapture,
  organisationRevisionTarget,
} from './organisationRevision.js'
import type { OrganisationRevisionActor } from './organisationRevision.js'
// TYPES
import type { InferInsertModel, SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type {
  Id,
  Database,
  Locale,
  LocaleKey,
  QueryParams,
  ListResponse,
} from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type {
  OrganisationDB,
  OrganisationDBNew,
  OrganisationDBPartial,
  OrganisationDBRaw,
  OrganisationI18nDB,
  OrganisationI18nNew,
  OrganisationI18nPartial,
  OrganisationRoleDB,
  OrganisationRoleNew,
} from '#lib/db/zod/schema/organisation.types.js'
// TYPES
import type { CapabilityDefinitions } from '#lib/capabilities.types.js'

type OrganisationProbe = {
  id: string
  hubId: string | null
  isPublished: boolean
  isArchived: boolean
}

type OrganisationUpdateProbe = {
  permitUserDetailsEdit?: boolean
  settings?: OrganisationDB['settings']
  id: string
  code: string
  hubId: string | null
  capabilities?: CapabilityDefinitions | null
  modifiedAt: string
}

type OrganisationCommandProbe = {
  id: string
  hubId: string | null
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createOrganisation
//    - prepareOrganisationRelations (internal)
//    - createI18n
//    - createUserRoles
//
// 1.2 CRUD :: CREATE (SHAPING)
//    - toUserRoles
//
// 2.1 CRUD :: READ
//    - listOrganisations
//    - getOrganisation
//
// 2.2 CRUD :: READ (PROBES)
//    - probeOrganisationQuery
//    - probeExistingOrganisation
//    - probeOrganisationForUpdate
//    - probeOrganisationForCommand
//    - resolveOrganisationCommandProbe
//
// 2.3 CRUD :: READ (RELATED)
//    - listUserRoles
//    - listUserRoleAssignments
//
// 2.4 CRUD :: READ (LOOKUPS)
//    - getOrganisationForFeatureId
//    - getOrganisationForProjectId
//
// 3.1 CRUD :: UPDATE
//    - updateOrganisationById
//    - updateOrganisationByIdWithConcurrency
//    - updateOrganisationPublishedStateById
//    - cascadeOrganisationPublishedStateToDescendants
//    - buildOrganisationCommandScopeGuard
//    - updateOrganisationArchivedStateById
//    - buildOrganisationArchivedDescendantUpdates
//    - cascadeOrganisationArchivedStateToDescendants
//    - updateI18n
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - syncUserRoles
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════

/** Optional complete collections submitted with an organisation form. */
type OrganisationRelations = {
  userPolicy?: OrganisationUserPolicy
  properties?: Array<Record<string, unknown>>
  i18n?: Record<LocaleKey, OrganisationI18nPartial>
  userRoles?: OrganisationRoleNew[]
}

/**
 * Prepares owned organisation collections under the caller's revision guard.
 * @param db Request database.
 * @param id Authorized organisation identity.
 * @param relations Complete submitted collections; omitted collections are preserved.
 * @param guard Predicate checked by every deletion and insertion.
 * @returns Unexecuted statements for the caller's atomic batch.
 */
function prepareOrganisationRelations(
  db: Database,
  id: Id,
  relations: OrganisationRelations,
  guard: SQL,
): BatchItem<'sqlite'>[] {
  const writes: BatchItem<'sqlite'>[] = []
  if (relations.userPolicy !== undefined) {
    writes.push(...prepareOrganisationUserPolicy(db, id, relations.userPolicy, guard))
  }
  // Enforce ownership independently of any parent IDs in the submitted rows.
  if (relations.i18n !== undefined) {
    writes.push(
      ...prepareGuardedReplacement(
        db,
        organisationI18n,
        toRelatedRecords(
          relations.i18n,
          'organisationId',
          id,
          'locale',
        ) as InferInsertModel<typeof organisationI18n>[],
        organisationI18n.organisationId,
        id,
        guard,
      ),
    )
  }
  if (relations.userRoles !== undefined) {
    writes.push(...prepareOrganisationStaffRoles(db, id, relations.userRoles, guard))
  }
  return writes
}

/**
 * Creates a new organisation in the database.
 * @param db The database instance.
 * @param data The organisation data to insert.
 * @param relations Optional translations and initial role assignments.
 * @param actor Server-authenticated actor for immutable revision capture after migration.
 * @returns The newly created organisation.
 * @throws {Error} If the organisation creation fails.
 * @remarks Submitted relations commit with the parent; a failure restores all prior rows.
 */
export const createOrganisation = async (
  db: Database,
  data: OrganisationDBNew,
  relations?: OrganisationRelations,
  actor?: OrganisationRevisionActor,
): Promise<OrganisationDB> => {
  if (relations || actor) {
    const ownedRelations = relations ?? {}
    const id = data.id ?? nanoid(12)
    const catalog =
      ownedRelations.properties !== undefined
        ? await preparePropertyCatalog(
            db,
            ownedRelations.properties as Parameters<typeof preparePropertyCatalog>[1],
            { scope: 'organisation', id },
            actor,
          )
        : null
    const capture = actor
      ? await prepareOrganisationRevisionCapture(
          db,
          organisationRevisionTarget(id),
          actor,
        )
      : { before: [], after: [] }
    // Insert the parent first; a conflicting identity must fail before any relation replacement.
    const results = await db.batch([
      ...capture.before,
      db
        .insert(organisation)
        .values({ ...data, id, isPublished: data.isPublished ?? false })
        .returning(),
      ...prepareOrganisationRelations(db, id, ownedRelations, sql`1`),
      ...(catalog?.statements ?? []),
      ...capture.after,
    ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    const created = results[capture.before.length] as OrganisationDB[]
    if (!created[0]) throw new Error('Organisation creation returned no row')
    return created[0] as OrganisationDB
  }
  return await insert(db, organisation, {
    ...data,
    isPublished: data.isPublished ?? false,
  })
}

/**
 * Creates relational i18n records for an organisation
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<LocaleKey, OrganisationI18nNew>,
  organisationId: string,
): Promise<OrganisationI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'organisationId',
    organisationId,
    'locale',
  ) as InferInsertModel<typeof organisationI18n>[]

  return await insertManyRelated(
    db,
    organisationI18n,
    relatedRecords,
    'organisationId',
    organisationId,
  )
}

/**
 * Creates user roles for an organisation
 * @param db - The database instance
 * @param userRoles - Array of new user roles to create
 * @param organisationId - The ID of the organisation
 * @returns Array of created user roles with associated user information
 */
export const createUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  const writes = userRoles.map(row => {
    const role = row.role ?? 'member'
    if (!isOrganisationStaffRole(role))
      throw new Error('Invalid organisation staff assignment')
    return db
      .insert(organisationRole)
      .values({
        organisationId,
        userId: row.userId,
        role,
        viewAnalytics: row.viewAnalytics === true,
        grant: { manual: role },
      })
      .onConflictDoUpdate({
        target: [organisationRole.organisationId, organisationRole.userId],
        set: {
          grant: sql`json_patch(${organisationRole.grant},excluded.grant)`,
          viewAnalytics: sql`excluded.viewAnalytics`,
        },
      })
  })
  if (writes.length)
    await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]])
  return await listUserRoles(db, organisationId)
}

// ═══════════════════════
// 1.2 CRUD :: CREATE (SHAPING)
// ═══════════════════════

/**
 * Maps organisation form role rows into persisted role rows bound to organisationId.
 */
export const toUserRoles = (
  userRoles: Array<{ userId: string; role: string; viewAnalytics?: boolean }>,
  organisationId: string,
): Array<{
  organisationId: string
  userId: string
  role: string
  viewAnalytics: boolean
}> =>
  userRoles.map(userRole => ({
    organisationId,
    userId: userRole.userId,
    role: userRole.role,
    viewAnalytics: userRole.viewAnalytics === true,
  }))

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Narrows hydrated Drizzle organisation rows to the current raw organisation contract.
 * Keeps generic relation inference mismatches contained at the DB boundary.
 */
const toOrganisationDbRaw = (row: unknown): OrganisationDBRaw =>
  row as OrganisationDBRaw

/**
 * Narrows hydrated Drizzle organisation row collections to the current raw contract.
 * Used for `findMany` results where relation inference is wider than our API shapers need.
 */
const toOrganisationDbRawList = (rows: unknown[]): OrganisationDBRaw[] =>
  rows as OrganisationDBRaw[]

/**
 * listOrganisations operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 * @param db Request-local database.
 * @param withRelations Relations required by the selected response profile.
 * @param conditions Server-authorized predicates, narrowed by view filters.
 * @param opts Hub visibility scope.
 * @param pagination Bounded page and optional continuation.
 * @param sorting Requested stable ordering.
 * @param query Literal index search, view filters and optional count request.
 * @returns Matching rows and the full matching total, or null when counting is omitted.
 * @remarks Counts exclude cursor predicates and never hydrate resource relations.
 */
export const listOrganisations = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
  pagination?: {
    limit?: number
    offset?: number
    afterId?: string
    afterValue?: string | number | null
  },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: {
    q?: string
    indexFilters?: ResourceIndexFilters
    includeCount?: boolean
    countOnly?: boolean
    searchColumns?: string[]
    ignoreHubFilter?: boolean
    filtersToApply?: QueryParams
    locale?: Locale
  },
): Promise<ListResponse<OrganisationDBRaw>> => {
  const startedAt = Date.now()
  // Core or non-core hub filtering
  if (!query?.ignoreHubFilter) {
    const hubFilter = getOrganisationHubFilter(db, opts)
    if (hubFilter) {
      conditions.push(hubFilter)
    }
  }

  // Search is treated as a specialised filter.
  // Index search is literal and shares its predicate with the exact count.
  if (query?.indexFilters) {
    conditions.push(
      ...(await resourceIndexFilterConditions(db, 'organisation', query.indexFilters)),
    )
    if (query.q) conditions.push(resourceIndexSearchCondition('organisation', query.q))
  }
  if (query?.q && !query.indexFilters) {
    const search = query.q.toLowerCase()
    const searchColumns = query.searchColumns || ['code', 'name', 'description']
    const searchConditions: SQL<unknown>[] = []

    // Search in base organisation table columns
    const baseColumns = searchColumns.filter(col => col === 'code')
    for (const column of baseColumns) {
      const orgColumn = organisation[column as keyof typeof organisation]
      if (orgColumn) {
        searchConditions.push(like(sql`lower(${orgColumn})`, `%${search}%`))
      }
    }

    // Search in i18n table columns (name, description)
    const i18nColumns = searchColumns.filter(col =>
      ['name', 'description'].includes(col),
    )
    if (i18nColumns.length > 0) {
      // Create a subquery to check if any i18n record matches the search
      const i18nSearchConditions: SQL<unknown>[] = []
      for (const column of i18nColumns) {
        if (column === 'name') {
          i18nSearchConditions.push(
            sql`lower("organisationI18n"."name") like ${`%${search.toLowerCase()}%`}`,
          )
        } else if (column === 'description') {
          // Handle nullable description field
          i18nSearchConditions.push(
            sql`("organisationI18n"."description" IS NOT NULL AND lower("organisationI18n"."description") like ${`%${search.toLowerCase()}%`})`,
          )
        }
      }

      if (i18nSearchConditions.length > 0) {
        // Add condition that checks if organisation has any matching i18n records
        const combinedConditions =
          i18nSearchConditions.length === 1
            ? i18nSearchConditions[0]
            : sql`(${sql.join(i18nSearchConditions, sql` OR `)})`

        searchConditions.push(
          sql`EXISTS (
            SELECT 1 FROM "organisationI18n"
            WHERE "organisationI18n"."organisationId" = ${organisation.id}
            AND ${combinedConditions}
          )`,
        )
      }
    }

    if (searchConditions.length > 0) {
      if (searchConditions.length === 1) {
        conditions.push(searchConditions[0])
      } else {
        const combinedSearchCondition = or(...searchConditions)
        if (combinedSearchCondition) {
          conditions.push(combinedSearchCondition)
        }
      }
    }
  }

  const countWhere = and(...conditions)
  // Exact totals share authorization predicates but never hydrate list relations.
  if (query?.countOnly) {
    const totals = await db
      .select({ count: sql<number>`count(*)` })
      .from(organisation)
      .where(countWhere)
    return {
      data: [],
      totalCount: Number(totals[0]?.count ?? 0),
      hasMore: false,
      nextOffset: null,
      offset: 0,
      durationMs: Date.now() - startedAt,
    }
  }
  // Keyset pages advance using a unique immutable ID, independently of row offsets.
  if (pagination?.afterId && pagination.afterValue === undefined)
    conditions.push(gt(organisation.id, pagination.afterId))
  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const orderBy = toOrderByWithLocalizedFields({
    conditions,
    cursor:
      pagination?.afterId && pagination.afterValue !== undefined
        ? { id: pagination.afterId, value: pagination.afterValue }
        : undefined,
    db,
    locale: query?.locale,
    sortBy,
    sortOrder,
    fallbackColumn: organisation.modifiedAt,
    baseTable: organisation,
    localizedSortColumns: {
      name: organisationI18n.name,
      nameShort: organisationI18n.nameShort,
      description: organisationI18n.description,
    },
    i18nTable: organisationI18n,
    parentIdColumn: organisation.id,
    foreignKeyColumn: organisationI18n.organisationId,
    localeColumn: organisationI18n.locale,
  })

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  let data = await db.query.organisation.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit == null ? undefined : pagination.limit + 1,
    offset: pagination?.offset,
    orderBy,
  })
  // Count the complete authorized match, never the cursor's remaining suffix.
  const totalRows =
    query?.includeCount === false
      ? null
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(organisation)
          .where(countWhere)
  const totalCount = totalRows === null ? null : Number(totalRows[0]?.count ?? 0)
  const offset = pagination?.offset ?? 0
  const hasMore = pagination?.limit != null && data.length > pagination.limit
  if (pagination?.limit != null) data = data.slice(0, pagination.limit)
  const nextOffset = hasMore ? offset + data.length : null
  const durationMs = Date.now() - startedAt

  return {
    data: toOrganisationDbRawList(data),
    limit: pagination?.limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters: query?.filtersToApply,
    q: query?.q,
    durationMs,
  }
}

/**
 * getOrganisation operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const getOrganisation = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<OrganisationDBRaw | undefined> => {
  // Core or non-core hub filtering
  const hubFilter = getOrganisationHubFilter(db, opts)
  if (hubFilter) {
    conditions.push(hubFilter)
  }

  const row = await db.query.organisation.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
  return row ? toOrganisationDbRaw(row) : undefined
}

// ═══════════════════════
// 2.2 CRUD :: READ (PROBES)
// ═══════════════════════

/**
 * Probes organisation visibility/scope fields for read authorization.
 * @param db - The database instance.
 * @param params - Lookup reference and key selector.
 * @returns Minimal probe payload or `null`.
 */
export const probeOrganisationQuery = async (
  db: Database,
  params: { ref: string; refKey?: 'id' | 'code' },
): Promise<OrganisationProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: organisation.id,
        hubId: organisation.hubId,
        isPublished: organisation.isPublished,
        isArchived: organisation.isArchived,
      })
      .from(organisation)
      .where(
        params.refKey === 'code'
          ? eq(organisation.code, params.ref)
          : eq(organisation.id, params.ref as Id),
      )
      .limit(1),
  )
}

/**
 * probeExistingOrganisation operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const probeExistingOrganisation = async (
  db: Database,
  code: string,
): Promise<{ id: string } | null> => {
  return firstOrNull(
    await db
      .select({ id: organisation.id })
      .from(organisation)
      .where(eq(organisation.code, code))
      .limit(1),
  )
}

/**
 * Probes mutable organisation fields for update authorization and stale-write checks.
 * @param db - The database instance.
 * @param organisationId - Target organisation id.
 * @returns Minimal update probe payload or `null`.
 */
export const probeOrganisationForUpdate = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationUpdateProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: organisation.id,
        code: organisation.code,
        hubId: organisation.hubId,
        capabilities: organisation.capabilities,
        settings: organisation.settings,
        permitUserDetailsEdit: organisation.permitUserDetailsEdit,
        modifiedAt: organisation.modifiedAt,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId))
      .limit(1),
  )
}

/**
 * probeOrganisationForCommand operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const probeOrganisationForCommand = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationCommandProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId))
      .limit(1),
  )
}

/**
 * Resolves organisation command probe or delegates to not-found branch.
 * @param db - The database instance.
 * @param organisationId - Target organisation id.
 * @param onNotFound - Callback invoked when target is missing.
 * @returns Command probe payload.
 */
export const resolveOrganisationCommandProbe = async (
  db: Database,
  organisationId: Id,
  onNotFound: () => never,
): Promise<OrganisationCommandProbe> => {
  const probed = await probeOrganisationForCommand(db, organisationId)
  return resolveRequiredProbe(probed, onNotFound)
}

// ═══════════════════════
// 2.3 CRUD :: READ (RELATED)
// ═══════════════════════

/**
 * Reads user roles for an organisation
 * @param db - The database instance
 * @param organisationId - The ID of the organisation
 * @returns Array of user roles with associated user information
 */
export const listUserRoles = async (
  db: Database,
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  return await db.query.organisationRole.findMany({
    columns: { grant: false },
    with: {
      user: true,
    },
    where: and(
      eq(organisationRole.organisationId, organisationId),
      sql`${organisationRole.role} IN ('member','owner')`,
    ),
  })
}

/**
 * listUserRoleAssignments operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const listUserRoleAssignments = async (
  db: Database,
  organisationId: string,
): Promise<Array<{ userId: string; role: string; viewAnalytics?: boolean }>> => {
  return await db
    .select({
      userId: organisationRole.userId,
      role: organisationRole.role,
      viewAnalytics: organisationRole.viewAnalytics,
    })
    .from(organisationRole)
    .where(
      and(
        eq(organisationRole.organisationId, organisationId),
        sql`${organisationRole.role} IN ('member','owner')`,
      ),
    )
}

// ═══════════════════════
// 2.4 CRUD :: READ (LOOKUPS)
// ═══════════════════════

/**
 * Retrieves the organisation associated with a feature ID
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForFeatureId = async (
  db: Database,
  featureId: Id,
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: { with: { organisation: true } } } } },
  })
  return record?.layer?.project?.organisation || undefined
}

/**
 * Retrieves the organisation associated with a project ID
 * @param db - The database instance
 * @param projectId - The ID of the project
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForProjectId = async (
  db: Database,
  projectId: Id,
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    with: { organisation: true },
  })
  return record?.organisation || undefined
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════

/**
 * Updates an existing organisation in the database by ID
 * @param db - The database instance
 * @param data - The updated organisation data
 * @param id - The ID of the organisation
 * @returns The updated organisation
 */
export const updateOrganisationById = async (
  db: Database,
  data: OrganisationDBPartial,
  id: Id,
): Promise<OrganisationDB> => await update(db, organisation, data, organisation.id, id)

/**
 * Updates organisation fields with optimistic concurrency guard on `modifiedAt`.
 * @param db - The database instance.
 * @param params - Update payload including expected `updatedAt`.
 * @returns Updated id/modifiedAt pair or `null` when stale/missing.
 * @remarks Submitted capability definitions and descendant restrictions commit together;
 * omitted capability definitions leave project and role permissions unchanged.
 * Submitted translations and organisation roles share that transaction and revision guard.
 */
export const updateOrganisationByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    actorId?: string
    updatedAt: string
    userPolicy?: OrganisationUserPolicy
    properties?: Array<Record<string, unknown>>
    i18n?: Record<LocaleKey, OrganisationI18nPartial>
    userRoles?: OrganisationRoleNew[]
    data: {
      code?: string
      url?: string | null
      settings?: OrganisationDB['settings']
      defaultLocationVisibility?: OrganisationDB['defaultLocationVisibility']
      permitUserDetailsEdit?: boolean
      capabilities?: OrganisationDB['capabilities']
    }
  },
): Promise<{ id: string; modifiedAt: string } | null> => {
  const revisionGuard = and(
    eq(organisation.id, params.id),
    eq(organisation.modifiedAt, params.updatedAt),
  )
  const updateCore = db
    .update(organisation)
    .set({ ...params.data, modifiedAt: new Date().toISOString() })
    .where(revisionGuard)
    .returning({
      id: organisation.id,
      modifiedAt: organisation.modifiedAt,
    })

  const guard = exists(
    db.select({ id: organisation.id }).from(organisation).where(revisionGuard),
  )
  // Keep the parent token unchanged while every submitted collection checks the same revision.
  const writes = prepareOrganisationRelations(db, params.id, params, guard)
  if (params.data.capabilities !== undefined) {
    writes.push(
      ...buildOrganisationCapabilityCascade(
        db,
        params.id,
        params.data.capabilities,
        guard,
      ),
    )
  }

  const ownCapture = params.actorId
    ? await prepareOrganisationRevisionCapture(
        db,
        organisationRevisionTarget(params.id),
        { actorId: params.actorId, reason: 'Organisation form save' },
      )
    : { before: [], after: [] }
  const actor = params.actorId ? { actorId: params.actorId } : undefined
  const projects = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT id FROM project WHERE organisationId=${params.id}`,
    params.data.capabilities !== undefined ? actor : undefined,
  )
  const capture = {
    before: [...ownCapture.before, ...projects.before],
    after: [...projects.after, ...ownCapture.after],
  }
  if (capture.before.length) {
    const catalog =
      params.properties !== undefined
        ? await preparePropertyCatalog(
            db,
            params.properties as Parameters<typeof preparePropertyCatalog>[1],
            { scope: 'organisation', id: params.id },
            {
              actorId: params.actorId!,
              reason: 'Organisation field definitions updated',
            },
          )
        : null
    // Capture the complete preimage and final projection in the same guarded form transaction.
    const statements = [
      ...capture.before,
      ...(catalog?.statements ?? []),
      ...writes,
      updateCore,
      ...capture.after,
    ]
    const results = await executeRevisionBatch(db, guard, statements)
    if (!results) return null
    const rows = results[
      capture.before.length + (catalog?.statements.length ?? 0) + writes.length
    ] as { id: string; modifiedAt: string }[]
    return rows[0] ?? null
  }

  if (params.properties !== undefined) {
    const catalog = await preparePropertyCatalog(
      db,
      params.properties as Parameters<typeof preparePropertyCatalog>[1],
      { scope: 'organisation', id: params.id },
      params.actorId
        ? { actorId: params.actorId, reason: 'Organisation field definitions updated' }
        : undefined,
    )
    // Check the revision inside the batch before any catalog mutation can run.
    const results = await executeRevisionBatch(db, guard, [
      catalog.statements[0],
      ...catalog.statements.slice(1),
      ...writes,
      updateCore,
    ])
    if (!results) return null
    const rows = results.at(-1) as { id: string; modifiedAt: string }[]
    return rows[0] ?? null
  }
  if (writes.length) {
    // A failure at any stage restores permissions, translations, descendants and the write token.
    const results =
      params.userPolicy !== undefined
        ? await executeRevisionBatch(db, guard, [...writes, updateCore])
        : await db.batch([writes[0], ...writes.slice(1), updateCore])
    if (!results) return null
    const rows = results.at(-1) as { id: string; modifiedAt: string }[]
    return rows[0] ?? null
  }
  const [updated] = await updateCore
  return updated ?? null
}

/**
 * Atomically toggles publication for an organisation, its descendants, and eligible images.
 * @param db - The database instance.
 * @param params - Target id, next publish state, and publisher id.
 * @param params.publishChildren - Explicitly include draft descendants when publishing.
 * @param params.expectedScope - Persisted ancestry used for authorization before this transaction.
 * @remarks Changed ancestry returns null without publication writes; role grants are not re-read here.
 * @returns Updated id/state pair or `null`; any write failure rolls back the entire hierarchy command.
 */
export const updateOrganisationPublishedStateById = async (
  db: Database,
  params: {
    id: Id
    expectedScope: { hubId: string | null }
    state: boolean
    publisherId: string | null
    publishChildren?: boolean
  },
): Promise<{ id: string; isPublished: boolean } | null> => {
  const ownCapture = params.publisherId
    ? await prepareOrganisationRevisionCapture(
        db,
        organisationRevisionTarget(params.id),
        { actorId: params.publisherId, reason: 'Organisation publication' },
      )
    : { before: [], after: [] }
  const actor = params.publisherId ? { actorId: params.publisherId } : undefined
  const projects = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT id FROM project WHERE organisationId=${params.id}`,
    actor,
  )
  const layers = await prepareAdminResourceRevisionCapture(
    db,
    'layer',
    sql`SELECT id FROM layer WHERE organisationId=${params.id}`,
    actor,
  )
  const capture = {
    before: [...ownCapture.before, ...projects.before, ...layers.before],
    after: [...layers.after, ...projects.after, ...ownCapture.after],
  }
  const parentUpdate = db
    .update(organisation)
    .set({
      isPublished: params.state,
      publishedAt: params.state ? new Date().toISOString() : null,
      publisherId: params.state ? params.publisherId : null,
    })
    .where(eq(organisation.id, params.id))
    .returning({
      id: organisation.id,
      isPublished: organisation.isPublished,
    })

  // Commit parent, descendant snapshots, and image policies as one transaction.
  // Recheck the authorized ancestry before any publication writes can execute.
  const results = await executeRevisionBatch(
    db,
    buildOrganisationCommandScopeGuard(db, params),
    [
      ...capture.before,
      parentUpdate,
      // A skipped parent write must not commit descendant publication changes.
      prepareRevisionCheck(db, sql`changes() = 1`),
      ...(await buildDescendantPublication(
        db,
        { kind: 'organisation', id: params.id },
        params,
      )),
      ...capture.after,
    ],
  )
  return results
    ? ((results[capture.before.length] as { id: string; isPublished: boolean }[])[0] ??
        null)
    : null
}

/**
 * Cascades an organisation publish-state change into descendant projects, layers, and features.
 * Existing local publish snapshots are preserved while an ancestor remains unpublished.
 * @param db - The database instance.
 * @param params - The parent organisation id and next publish state.
 * @param params.publishChildren - Whether publishing explicitly includes all draft descendants.
 * @param params.publisherId - Actor attributed to explicitly published descendants.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeOrganisationPublishedStateToDescendants = async (
  db: Database,
  params: {
    organisationId: Id
    state: boolean
    publishChildren?: boolean
    publisherId?: Id
  },
): Promise<void> => {
  await db.batch(
    await buildDescendantPublication(
      db,
      { kind: 'organisation', id: params.organisationId },
      params,
    ),
  )
}

/**
 * Rechecks persisted ancestry used to authorize a state command.
 * @param db Request database.
 * @param params Target identity and authorized scope.
 * @returns Transaction predicate requiring unchanged ancestry, including nullable hub identity.
 * @remarks Role grants are not re-read by this scope predicate.
 */
function buildOrganisationCommandScopeGuard(
  db: Database,
  params: { id: Id; expectedScope: { hubId: string | null } },
): SQL {
  return exists(
    db
      .select({ id: organisation.id })
      .from(organisation)
      .where(
        and(
          eq(organisation.id, params.id),
          sql`${organisation.hubId} IS ${params.expectedScope.hubId}`,
        ),
      ),
  )
}

/**
 * Toggles archived state for an organisation.
 * @param db - The database instance.
 * @param params - Target id and next archived state.
 * @param params.expectedScope Ancestry captured before authorization.
 * @remarks Parent and descendant writes roll back together; changed scope returns null.
 * @returns Updated id/state pair or `null`.
 */
export const updateOrganisationArchivedStateById = async (
  db: Database,
  params: {
    actorId?: string
    id: Id
    state: boolean
    expectedScope: { hubId: string | null }
  },
): Promise<{ id: string; isArchived: boolean } | null> => {
  const ownCapture = params.actorId
    ? await prepareOrganisationRevisionCapture(
        db,
        organisationRevisionTarget(params.id),
        { actorId: params.actorId, reason: 'Organisation archive state' },
      )
    : { before: [], after: [] }
  const actor = params.actorId ? { actorId: params.actorId } : undefined
  const projects = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT id FROM project WHERE organisationId=${params.id}`,
    actor,
  )
  const layers = await prepareAdminResourceRevisionCapture(
    db,
    'layer',
    sql`SELECT id FROM layer WHERE organisationId=${params.id}`,
    actor,
  )
  const capture = {
    before: [...ownCapture.before, ...projects.before, ...layers.before],
    after: [...layers.after, ...projects.after, ...ownCapture.after],
  }
  const parentUpdate = db
    .update(organisation)
    .set({ isArchived: params.state })
    .where(eq(organisation.id, params.id))
    .returning({
      id: organisation.id,
      isArchived: organisation.isArchived,
    })

  // Commit the parent and descendant snapshots only in the authorized scope.
  const results = await executeRevisionBatch(
    db,
    buildOrganisationCommandScopeGuard(db, params),
    [
      ...capture.before,
      parentUpdate,
      prepareRevisionCheck(db, sql`changes() = 1`),
      ...buildOrganisationArchivedDescendantUpdates(db, {
        organisationId: params.id,
        state: params.state,
      }),
      ...capture.after,
    ],
  )
  return results
    ? ((results[capture.before.length] as { id: string; isArchived: boolean }[])[0] ??
        null)
    : null
}

/**
 * Cascades an organisation archive-state change into descendant projects, layers, and
 * features. Existing local archive snapshots are preserved while an ancestor remains
 * archived so unarchiving restores the prior descendant state instead of blindly
 * reviving every record.
 * @param db - The database instance.
 * @param params - The parent organisation id and next archived state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeOrganisationArchivedStateToDescendants = async (
  db: Database,
  params: {
    organisationId: Id
    state: boolean
  },
): Promise<void> => {
  await db.batch(buildOrganisationArchivedDescendantUpdates(db, params))
}

/**
 * Prepares descendant archive snapshots without executing writes.
 * @param db Request database.
 * @param params Parent identity and next archive state.
 * @returns Ordered statements for the parent's guarded transaction.
 */
function buildOrganisationArchivedDescendantUpdates(
  db: Database,
  params: { organisationId: Id; state: boolean },
): [BatchItem<'sqlite'>, BatchItem<'sqlite'>, BatchItem<'sqlite'>] {
  // Preserve local archive choices while applying or restoring the ancestor state.
  const projects = db
    .update(project)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${project.localIsArchived}, ${project.isArchived})`
        : null,
      isArchived: params.state
        ? sql`1`
        : sql`coalesce(${project.localIsArchived}, ${project.isArchived})`,
    })
    .where(eq(project.organisationId, params.organisationId))

  const layers = db
    .update(layer)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${layer.localIsArchived}, ${layer.isArchived})`
        : null,
      isArchived: params.state
        ? sql`1`
        : sql`coalesce(${layer.localIsArchived}, ${layer.isArchived})`,
    })
    .where(eq(layer.organisationId, params.organisationId))

  const features = db
    .update(feature)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${feature.localIsArchived}, ${feature.isArchived})`
        : null,
      isArchived: params.state
        ? sql`1`
        : sql`coalesce(${feature.localIsArchived}, ${feature.isArchived})`,
    })
    .where(eq(feature.organisationId, params.organisationId))
  return [projects, layers, features]
}

/**
 * Updates translations for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<LocaleKey, OrganisationI18nPartial>,
  organisationId: string,
): Promise<OrganisationI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'organisationId',
    organisationId,
    'locale',
  ) as InferInsertModel<typeof organisationI18n>[]

  return await replaceManyRelated(
    db,
    organisationI18n,
    relatedRecords,
    organisationI18n.organisationId,
    organisationId,
  )
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Updates manual staff grants while retaining independent audience membership
 * @param db - The database instance
 * @param userRoles - Array of user roles to update
 * @param organisationId - The ID of the organisation
 * @returns Array of updated user roles with associated user information
 */
export const syncUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  await db.batch(prepareOrganisationStaffRoles(db, organisationId, userRoles))
  return await listUserRoles(db, organisationId)
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
