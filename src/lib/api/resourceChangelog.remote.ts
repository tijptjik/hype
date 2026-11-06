// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery, guardedCommand } from './server/guarded'
import {
  authorizeOrganisationUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
  authorizeLayerUpdateForSubmission,
  authorizeFeaturePublishForSubmission,
} from './services/authz'
// SERVICES
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
import { probeProjectQuery } from '#lib/db/services/project.js'
import { probeLayerForUpdate } from '#lib/db/services/layer.js'
import {
  listResourceChangelog,
  buildChangelogRootGuard,
} from '#lib/db/services/resourceChangelog.js'
import {
  readUserResourceCheckpoint,
  saveUserResourceCheckpoint,
} from '#lib/db/services/userResourceCheckpoint.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
// TYPES
import type {
  ChangelogSubject,
  ChangelogScope,
} from '#lib/db/services/resourceChangelog.js'
import type { GuardedBaseContext } from './guarded.types'
import type { ChangelogPage } from '#lib/revisions/changelog.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Authorized root scope
// 2. Hierarchy feed
// 3. Private reading progress
// ---

// 1. Authorized root scope
const resourceIdentity = {
  resource: z.enum(['organisation', 'project', 'layer']),
  ref: z.string().min(1),
  meta: z.strictObject({ isAdminRequest: z.boolean() }).optional(),
}

/** Authorize a changelog root using persisted ancestry for reads and progress writes.
 * @param input Route identity without client-supplied user or ancestry.
 * @param ctx Authenticated request context.
 * @returns Canonical identity and the ancestry to repeat at the database boundary.
 */
async function authorizeChangelogScope(
  input: { resource: ChangelogScope['resource']; ref: string },
  ctx: GuardedBaseContext,
): Promise<ChangelogScope> {
  const actor = { user: ctx.user, userRoles: ctx.userRoles }
  let scope: ChangelogScope
  if (input.resource === 'organisation') {
    const probe = await probeOrganisationQuery(ctx.db, {
      ref: input.ref,
      refKey: 'code',
    })
    if (!probe) error(404, 'ORGANISATION_NOT_FOUND')
    if (
      !authorizeOrganisationUpdateForSubmission({
        ...actor,
        resource: probe,
        submittedData: { i18n: true },
      }).allowed
    )
      error(403, 'INSUFFICIENT_ROLE')
    scope = {
      resource: input.resource,
      id: probe.id,
      organisationId: probe.id,
      hubId: probe.hubId,
    }
  } else if (input.resource === 'project') {
    const probe = await probeProjectQuery(ctx.db, { ref: input.ref, refKey: 'code' })
    if (!probe) error(404, 'PROJECT_NOT_FOUND')
    if (
      !authorizeProjectUpdateForSubmission({
        ...actor,
        resource: probe,
        submittedData: { i18n: true },
      }).allowed
    )
      error(403, 'INSUFFICIENT_ROLE')
    scope = {
      resource: input.resource,
      id: probe.id,
      projectId: probe.id,
      organisationId: probe.organisationId,
      hubId: probe.hubId,
    }
  } else {
    const probe = await probeLayerForUpdate(ctx.db, input.ref)
    if (!probe) error(404, 'LAYER_NOT_FOUND')
    if (
      !authorizeLayerUpdateForSubmission({
        ...actor,
        resource: probe,
        submittedData: { i18n: true },
      }).allowed
    )
      error(403, 'INSUFFICIENT_ROLE')
    scope = {
      resource: input.resource,
      id: probe.id,
      projectId: probe.projectId,
      organisationId: probe.organisationId,
      hubId: probe.hubId,
    }
  }
  return scope
}

// 2. Hierarchy feed
/**
 * Loads the accepted hierarchy changelog for a currently authorized resource editor.
 * @param input Root route reference, locale, view filters, metadata intent and stable cursor.
 * @returns Localized owner metadata and a bounded page of authorized changes.
 * @remarks Every child is authorized separately. Neither a task nor an unaccepted draft
 * is a change; historical Feature values retain the existing current-audience protection.
 */
export const getResourceChangelog = guardedQuery(
  z.strictObject({
    ...resourceIdentity,
    locale: z.enum(['en', 'zhHant', 'zhHans']),
    filters: z
      .strictObject({
        resourceType: z
          .enum(['organisation', 'project', 'layer', 'feature', 'property'])
          .optional(),
        category: z
          .enum(['profile', 'fields', 'publication', 'maintenance'])
          .optional(),
        action: z
          .enum([
            'created',
            'updated',
            'added',
            'removed',
            'published',
            'unpublished',
            'archived',
            'restored',
            'baseline',
          ])
          .optional(),
        actor: z
          .strictObject({
            id: z.string().min(1).max(256),
            origin: z.string().min(1).max(64),
          })
          .optional(),
        origin: z.enum(['user', 'system', 'migration', 'import', 'restore']).optional(),
        search: z.string().max(200).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .refine(value => !value.from || !value.to || value.from <= value.to, {
        message: 'Start date must precede end date',
      })
      .optional(),
    includeFilterOptions: z.boolean().optional(),
    before: z
      .strictObject({
        createdAt: z.string().min(1).max(64),
        key: z.string().min(1).max(256),
      })
      .optional(),
  }),
  async (input, ctx): Promise<ChangelogPage> => {
    const actor = { user: ctx.user, userRoles: ctx.userRoles }
    const scope = await authorizeChangelogScope(input, ctx)
    // Capture the cutoff before reading rows so later concurrent changes stay new next time.
    const checkedThrough = new Date().toISOString()
    const lastCheckedAt = await readUserResourceCheckpoint(ctx.db, {
      userId: ctx.user.id,
      resourceType: scope.resource,
      resourceId: scope.id,
      checkpointKind: 'changelog',
      guard: buildChangelogRootGuard(scope),
    })
    /** Authorize each descendant using its persisted ancestry and the relevant existing policy.
     * @param row Server-selected candidate, never a client-supplied permission target.
     * @returns Whether this editor may inspect this kind of revision.
     */
    function authorize(row: ChangelogSubject): boolean {
      const resource = {
        id: row.ownerId,
        organisationId: row.organisationId,
        projectId: row.projectId,
        layerId: row.layerId,
        hubId: row.hubId,
        resourceHubId: row.hubId,
        isArchived: Boolean(row.isArchived),
      }
      const common = {
        ...actor,
        resource,
        submittedData: row.category === 'fields' ? { properties: [] } : { i18n: true },
      }
      if (row.ownerType === 'organisation')
        return authorizeOrganisationUpdateForSubmission(common).allowed
      if (row.ownerType === 'project')
        return authorizeProjectUpdateForSubmission(common).allowed
      if (row.ownerType === 'layer')
        return authorizeLayerUpdateForSubmission(common).allowed
      return authorizeFeaturePublishForSubmission({ ...actor, resource }).allowed
    }
    const locales =
      input.locale === 'en'
        ? ['en', 'zhHant', 'zhHans']
        : input.locale === 'zhHant'
          ? ['zhHant', 'zhHans', 'en']
          : ['zhHans', 'zhHant', 'en']
    const access = await getInternalPropertyAccess(ctx)
    const result = await listResourceChangelog(ctx.db, {
      scope,
      locales,
      before: input.before,
      filters: input.filters,
      includeFilterOptions: input.includeFilterOptions,
      authorize,
      internalIds: access.internal,
      allowedInternalIds: access.allowed,
    })
    const names = await ctx.db.all<{
      name: string
      locale: string
    }>(sql`SELECT name,locale FROM ${sql.identifier(`${input.resource}I18n`)}
    WHERE ${sql.identifier(`${input.resource}Id`)}=${scope.id}`)
    const name =
      locales
        .map(
          locale =>
            names.find(
              row =>
                row.locale.toLowerCase().replaceAll('-', '') === locale.toLowerCase(),
            )?.name,
        )
        .find(value => value?.trim()) ?? input.ref
    return {
      owner: { id: scope.id, name },
      ...result,
      checkpoint: { lastCheckedAt, checkedThrough },
    }
  },
)

// 3. Private reading progress
/** Save reading progress only after a page has loaded successfully.
 * @param input Authorized route identity and the reader's snapshot timestamp.
 * @returns The authenticated user's persisted monotonic checkpoint.
 * @remarks The client cannot choose another user or supply hierarchy ancestry. This
 * command changes private reading progress only and does not create a changelog entry.
 */
export const markResourceChangelogChecked = guardedCommand(
  z.strictObject({ ...resourceIdentity, checkedThrough: z.string().datetime() }),
  async (input, ctx): Promise<{ checkedAt: string }> => {
    const scope = await authorizeChangelogScope(input, ctx)
    const checkedAt = await saveUserResourceCheckpoint(ctx.db, {
      userId: ctx.user.id,
      resourceType: scope.resource,
      resourceId: scope.id,
      checkpointKind: 'changelog',
      guard: buildChangelogRootGuard(scope),
      checkedThrough: input.checkedThrough,
    })
    if (!checkedAt) error(409, 'CHANGELOG_SCOPE_CHANGED')
    return { checkedAt }
  },
)
