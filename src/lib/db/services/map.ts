// DRIZZLE
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
// UTILS
import { nanoid } from 'nanoid'
// DB
import { firstOrNull, transformI18nSafely } from '..'
import { prepareGuardedReplacement } from './guardedReplacement.js'
import type { BatchItem } from 'drizzle-orm/batch'
import {
  hub,
  mapStyleI18n,
  mapStyles,
  organisation,
  project,
  projectMapStyles,
} from '../schema'
// MAP
import { REGISTERED_MAP_STYLE_CATALOG } from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  MapStyleResolvedDB,
  MapStyleRowDB,
  ProjectMapStyleDB,
} from '#lib/db/zod/schema/map.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: SYNC
//    - syncMapStyleCatalog
//
// 1.2 CRUD :: UPSERT
//    - prepareProjectMapStyle
//    - isProjectMapStyleUnavailable
//    - setProjectMapStyleByCode
//
// 2.1 CRUD :: READ
//    - listMapStyles
//    - listMapStylesForScope
//    - listMapStylesForProject
//    - getProjectMapStyleAssignment
//
// 2.2 CRUD :: READ (SHAPING)
//    - toResolvedMapStyle
//
// 2.3 CRUD :: READ (LOOKUPS)
//    - isVisibleToScope
//    - getProjectScope
//    - getOrganisationMapStyleScope
//    - resolveVisibleMapStyleIdForScope
//    - assertMapStyleProjectScope

type ProjectScope = {
  id?: string
  organisationId: string
  hubId: string | null
}

/********************
 *  1.1 CRUD :: SYNC
 ************/

/**
 * Keeps persisted map-style rows aligned with the checked-in catalog.
 *
 * @param db - Database handle.
 * @returns Nothing.
 * @remarks
 * This resolves hub/organisation foreign keys from catalog codes once, then upserts
 * style metadata and localized copy so read paths can assume DB-backed rows exist.
 */
export const syncMapStyleCatalog = async (db: Database): Promise<void> => {
  const hubCodes = Array.from(
    new Set(
      REGISTERED_MAP_STYLE_CATALOG.map(entry => entry.hubCode).filter(
        (value): value is string => Boolean(value),
      ),
    ),
  )
  const organisationCodes = Array.from(
    new Set(
      REGISTERED_MAP_STYLE_CATALOG.map(entry => entry.organisationCode).filter(
        (value): value is string => Boolean(value),
      ),
    ),
  )

  const [hubRows, organisationRows, existingRows] = await Promise.all([
    hubCodes.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: hub.id, code: hub.code })
          .from(hub)
          .where(inArray(hub.code, hubCodes)),
    organisationCodes.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: organisation.id, code: organisation.code })
          .from(organisation)
          .where(inArray(organisation.code, organisationCodes)),
    db.query.mapStyles.findMany({
      with: {
        i18n: true,
      },
    }),
  ])

  // Resolve foreign keys once up front so the catalog loop can stay deterministic.
  const hubIdByCode = new Map(hubRows.map(row => [row.code, row.id]))
  const organisationIdByCode = new Map(organisationRows.map(row => [row.code, row.id]))
  const existingByCode = new Map(existingRows.map(row => [row.code, row]))

  for (const entry of REGISTERED_MAP_STYLE_CATALOG) {
    const existing = existingByCode.get(entry.key)
    const nextHubId = entry.hubCode ? (hubIdByCode.get(entry.hubCode) ?? null) : null
    const nextOrganisationId = entry.organisationCode
      ? (organisationIdByCode.get(entry.organisationCode) ?? null)
      : null
    const localizedCopy = getMapStyleCatalogI18n(entry.key)

    if (!existing) {
      const id = nanoid(12)
      await db
        .insert(mapStyles)
        .values({
          id,
          code: entry.key,
          organisationId: nextOrganisationId,
          hubId: nextHubId,
          previewImagePath: null,
        })
        .onConflictDoNothing({ target: mapStyles.code })

      // Resolve the persisted row again so concurrent syncs converge on the same id.
      const persisted = firstOrNull(
        await db
          .select({
            id: mapStyles.id,
            organisationId: mapStyles.organisationId,
            hubId: mapStyles.hubId,
            previewImagePath: mapStyles.previewImagePath,
          })
          .from(mapStyles)
          .where(eq(mapStyles.code, entry.key))
          .limit(1),
      )

      if (!persisted) {
        throw new Error(`Failed to persist map style catalog entry: ${entry.key}`)
      }

      await db
        .insert(mapStyleI18n)
        .values(
          Object.entries(localizedCopy).map(([locale, copy]) => ({
            mapStyleId: persisted.id,
            locale,
            name: copy.name,
            nameGen: false,
            description: copy.description,
            descriptionGen: false,
          })),
        )
        .onConflictDoUpdate({
          target: [mapStyleI18n.mapStyleId, mapStyleI18n.locale],
          set: {
            name: sql.raw('excluded.name'),
            nameGen: false,
            description: sql.raw('excluded.description'),
            descriptionGen: false,
          },
        })
      continue
    }

    if (
      existing.organisationId !== nextOrganisationId ||
      existing.hubId !== nextHubId ||
      existing.previewImagePath !== null
    ) {
      await db
        .update(mapStyles)
        .set({
          organisationId: nextOrganisationId,
          hubId: nextHubId,
          previewImagePath: null,
        })
        .where(eq(mapStyles.id, existing.id))
    }

    for (const [locale, copy] of Object.entries(localizedCopy)) {
      const existingLocale = existing.i18n?.find(row => row.locale === locale)

      if (!existingLocale) {
        await db
          .insert(mapStyleI18n)
          .values({
            mapStyleId: existing.id,
            locale,
            name: copy.name,
            nameGen: false,
            description: copy.description,
            descriptionGen: false,
          })
          .onConflictDoUpdate({
            target: [mapStyleI18n.mapStyleId, mapStyleI18n.locale],
            set: {
              name: copy.name,
              nameGen: false,
              description: copy.description,
              descriptionGen: false,
            },
          })
        continue
      }

      if (
        existingLocale.name !== copy.name ||
        existingLocale.nameGen !== false ||
        (existingLocale.description ?? null) !== copy.description ||
        existingLocale.descriptionGen !== false
      ) {
        await db
          .update(mapStyleI18n)
          .set({
            name: copy.name,
            nameGen: false,
            description: copy.description,
            descriptionGen: false,
          })
          .where(
            and(
              eq(mapStyleI18n.mapStyleId, existing.id),
              eq(mapStyleI18n.locale, locale),
            ),
          )
      }
    }
  }
}

/********************
 *  1.2 CRUD :: UPSERT
 ************/

/**
 * Prepares a map-style replacement for an enclosing project transaction.
 * @param db Request database.
 * @param params Authorized destination identity, code and organisation plus desired style.
 * @param guard Project revision predicate checked by every assignment mutation.
 * @returns Unexecuted assignment statements with a write-time visibility lookup.
 * @remarks The prospective project code supports creation/renaming before the final parent write.
 * Hub visibility uses the destination organisation's live affiliation. An unavailable style
 * produces NULL in the required assignment column, aborting the enclosing transaction.
 */
export function prepareProjectMapStyle(
  db: Database,
  params: {
    projectId: string
    projectCode: string
    organisationId: string
    mapStyleCode?: string | null
  },
  guard: SQL,
): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  const code = params.mapStyleCode?.trim()
  const liveHub = sql`(select ${organisation.hubId} from ${organisation} where ${organisation.id} = ${params.organisationId})`
  const visible = db
    .select({ id: mapStyles.id })
    .from(mapStyles)
    .where(
      and(
        eq(mapStyles.code, code ?? ''),
        isVisibleToScope(
          { id: params.projectId, organisationId: params.organisationId, hubId: null },
          liveHub,
          params.projectCode,
        ),
      ),
    )
    .limit(1)
  // The assignment and the core record either both commit or both retain their previous state.
  return prepareGuardedReplacement(
    db,
    projectMapStyles,
    code
      ? [{ projectId: params.projectId, mapStyleId: sql`(${visible})` } as never]
      : [],
    projectMapStyles.projectId,
    params.projectId,
    guard,
  )
}

/**
 * Recognizes only the required-style constraint used by transactional style selection.
 * @param cause Database error, potentially wrapped by Drizzle or D1.
 * @returns Whether the assignment failed because its visible style was unavailable.
 */
export function isProjectMapStyleUnavailable(cause: unknown): boolean {
  const pending: unknown[] = [cause]
  const seen = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const wrapped = value as {
      message?: unknown
      cause?: unknown
      error?: unknown
      errors?: unknown[]
    }
    if (
      typeof wrapped.message === 'string' &&
      /NOT NULL constraint failed: projectMapStyles\.mapStyleId\b/i.test(
        wrapped.message,
      )
    )
      return true
    pending.push(wrapped.cause, wrapped.error)
    if (Array.isArray(wrapped.errors)) pending.push(...wrapped.errors)
  }
  return false
}

/**
 * Replaces a project's map-style assignment using a catalog code.
 *
 * @param db - Database handle.
 * @param params - Project scope and optional catalog code.
 * @returns Nothing.
 * @remarks
 * This treats the assignment row as replace-only: delete the previous mapping and
 * insert the requested visible style in one transaction. Invalid or failed replacements
 * preserve the previous assignment; an empty code explicitly clears it.
 */
export const setProjectMapStyleByCode = async (
  db: Database,
  params: {
    projectId: string
    organisationId: string
    hubId: string | null
    mapStyleCode?: string | null
  },
): Promise<void> => {
  const normalizedCode = params.mapStyleCode?.trim() || null

  const deletion = db
    .delete(projectMapStyles)
    .where(eq(projectMapStyles.projectId, params.projectId))

  if (!normalizedCode) {
    await deletion
    return
  }

  const mapStyleId = await resolveVisibleMapStyleIdForScope(
    db,
    {
      id: params.projectId,
      organisationId: params.organisationId,
      hubId: params.hubId,
    },
    normalizedCode,
  )

  if (!mapStyleId) {
    throw new Error(`Unknown or unavailable map style: ${normalizedCode}`)
  }

  // Recheck identity, code and visibility at write time, not only in the preflight lookup.
  // An unavailable style yields NULL and the required mapStyleId aborts the whole batch.
  const visibleStyle = db
    .select({ id: mapStyles.id })
    .from(mapStyles)
    .where(
      and(
        eq(mapStyles.id, mapStyleId),
        eq(mapStyles.code, normalizedCode),
        isVisibleToScope({ ...params, id: params.projectId }),
      ),
    )
    .limit(1)
  await db.batch([
    deletion,
    db.insert(projectMapStyles).values({
      projectId: params.projectId,
      mapStyleId: sql`(${visibleStyle})`,
    }),
  ])
}

/********************
 *  2.1 CRUD :: READ
 ************/

/**
 * Lists every persisted map style.
 *
 * @param db - Database handle.
 * @returns All map styles ordered by catalog code.
 */
export const listMapStyles = async (db: Database): Promise<MapStyleResolvedDB[]> => {
  const rows = await db.query.mapStyles.findMany({
    with: {
      i18n: true,
    },
    orderBy: (mapStyles, { asc }) => [asc(mapStyles.code)],
  })

  return rows.map(row => toResolvedMapStyle(row as MapStyleRowDB))
}

/**
 * Lists map styles visible to a specific organisation and hub scope.
 *
 * @param db - Database handle.
 * @param scope - Organisation and optional hub scope.
 * @returns Visible map styles ordered by catalog code.
 */
export const listMapStylesForScope = async (
  db: Database,
  scope: ProjectScope,
): Promise<MapStyleResolvedDB[]> => {
  const rows = await db.query.mapStyles.findMany({
    where: isVisibleToScope(scope),
    with: {
      i18n: true,
    },
    orderBy: (mapStyles, { asc }) => [asc(mapStyles.code)],
  })

  return rows.map(row => toResolvedMapStyle(row as MapStyleRowDB))
}

/**
 * Lists map styles visible to a project by resolving its organisation and hub scope.
 *
 * @param db - Database handle.
 * @param projectRef - Project id or code.
 * @returns Visible map styles for the project, or an empty list when the project is missing.
 */
export const listMapStylesForProject = async (
  db: Database,
  projectRef: string,
): Promise<MapStyleResolvedDB[]> => {
  const scope = await getProjectScope(db, projectRef)
  if (!scope) {
    return []
  }

  return await listMapStylesForScope(db, scope)
}

/**
 * Loads the current project-to-map-style assignment row.
 *
 * @param db - Database handle.
 * @param projectRef - Project id or code.
 * @returns Assignment row, or `null` when the project or assignment is missing.
 */
export const getProjectMapStyleAssignment = async (
  db: Database,
  projectRef: string,
): Promise<ProjectMapStyleDB | null> => {
  const scope = await getProjectScope(db, projectRef)

  if (!scope) {
    return null
  }

  return firstOrNull(
    await db
      .select()
      .from(projectMapStyles)
      .where(eq(projectMapStyles.projectId, scope.id)),
  )
}

/********************
 *  2.2 CRUD :: READ (SHAPING)
 ************/

/**
 * Normalizes raw map-style rows into the locale-map shape used by callers.
 *
 * @param row - Raw hydrated map-style row.
 * @returns Map style with transformed i18n payload.
 */
const toResolvedMapStyle = (row: MapStyleRowDB): MapStyleResolvedDB => ({
  ...row,
  i18n: transformI18nSafely(row.i18n ?? [], null) as MapStyleResolvedDB['i18n'],
})

/********************
 *  2.3 CRUD :: READ (LOOKUPS)
 ************/

/**
 * Builds the visibility predicate for a scope-aware map-style query.
 *
 * @param scope - Organisation and optional hub scope for the caller.
 * @param liveHub - Optional execution-time hub lookup for a transactional write.
 * @param projectCode - Optional authorized prospective code during project creation or rename.
 * @returns SQL predicate that keeps global styles visible while honoring scoped styles.
 * @remarks
 * A `null` hub means "core/global only", so hub-scoped styles are excluded in that case.
 * Project-only catalog entries also require a matching persisted project id and code.
 */
const isVisibleToScope = (
  scope: ProjectScope,
  liveHub?: SQL,
  projectCode?: string,
): SQL | undefined =>
  and(
    // Missing persisted owner IDs must not turn catalog-restricted styles into global styles.
    ...REGISTERED_MAP_STYLE_CATALOG.filter(entry => entry.hubCode).map(entry =>
      or(
        sql`${mapStyles.code} != ${entry.key}`,
        sql`EXISTS (SELECT 1 FROM "hub" AS "styleHub" WHERE "styleHub"."id" = ${liveHub ?? scope.hubId} AND "styleHub"."code" = ${entry.hubCode})`,
      ),
    ),
    // Keep owner identifiers literal: relational queries re-alias Drizzle column references.
    // Resolve the owning project inside SQL so missing projects fail closed.
    ...REGISTERED_MAP_STYLE_CATALOG.filter(entry => entry.projectCode).map(entry =>
      or(
        sql`${mapStyles.code} != ${entry.key}`,
        projectCode !== undefined
          ? sql`${projectCode} = ${entry.projectCode}`
          : scope.id
            ? sql`EXISTS (SELECT 1 FROM "project" AS "styleOwner" WHERE "styleOwner"."id" = ${scope.id} AND "styleOwner"."code" = ${entry.projectCode})`
            : sql`0`,
      ),
    ),
    or(
      isNull(mapStyles.organisationId),
      eq(mapStyles.organisationId, scope.organisationId),
    ),
    or(
      isNull(mapStyles.hubId),
      liveHub
        ? eq(mapStyles.hubId, liveHub)
        : scope.hubId
          ? eq(mapStyles.hubId, scope.hubId)
          : isNull(mapStyles.hubId),
    ),
  )

/**
 * Resolves the project scope used by project-level map-style reads and writes.
 *
 * @param db - Database handle.
 * @param projectRef - Project id or code.
 * @returns Project scope with resolved organisation and hub linkage, or `null`.
 */
const getProjectScope = async (
  db: Database,
  projectRef: string,
): Promise<(ProjectScope & { id: string }) | null> =>
  firstOrNull(
    await db
      .select({
        id: project.id,
        organisationId: project.organisationId,
        hubId: organisation.hubId,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(or(eq(project.id, projectRef), eq(project.code, projectRef))),
  )

/**
 * Resolves the organisation-level scope used by project map-style writes.
 *
 * @param db - Database handle.
 * @param organisationId - Target organisation id.
 * @returns Organisation scope with resolved hub linkage, or `null`.
 */
export const getOrganisationMapStyleScope = async (
  db: Database,
  organisationId: string,
): Promise<ProjectScope | null> => {
  return firstOrNull(
    await db
      .select({
        organisationId: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId)),
  )
}

/**
 * Resolves a visible map-style id for the supplied scope and catalog code.
 *
 * @param db - Database handle.
 * @param scope - Organisation and optional hub scope.
 * @param mapStyleCode - Catalog code to resolve.
 * @returns Matching visible map-style id, or `null`.
 */
export const resolveVisibleMapStyleIdForScope = async (
  db: Database,
  scope: ProjectScope,
  mapStyleCode: string,
): Promise<string | null> => {
  const row = firstOrNull(
    await db
      .select({
        id: mapStyles.id,
      })
      .from(mapStyles)
      .where(and(eq(mapStyles.code, mapStyleCode), isVisibleToScope(scope))),
  )

  return row?.id ?? null
}

/**
 * Checks project ownership before persisting a layer style or moving its layer.
 * @param db - Database handle.
 * @param projectId - Destination project id.
 * @param code - Requested layer map style, if any.
 * @returns Nothing when the style is available to the destination project.
 * @remarks Project restrictions come from the catalog even before database sync.
 */
export const assertMapStyleProjectScope = async (
  db: Database,
  projectId: string,
  code?: string | null,
): Promise<void> => {
  const ownerCode = REGISTERED_MAP_STYLE_CATALOG.find(
    entry => entry.key === code,
  )?.projectCode
  if (!ownerCode) return
  const owner = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.code, ownerCode)))
    .limit(1)
  if (!owner.length) throw new Error(`Unknown or unavailable map style: ${code}`)
}
