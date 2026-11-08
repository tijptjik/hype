// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
// DB
import { hub, hubI18n, hubRole } from '#lib/db/schema/hub.js'
import {
  organisation,
  organisationI18n,
  organisationRole,
} from '#lib/db/schema/organisation.js'
import { project, projectI18n, projectRole } from '#lib/db/schema/project.js'
import { getUserRoles } from '#lib/db/services/user.js'
// AUTH
import { canAccessAdminPanel } from './authz/user'
import {
  authorizeHubManageRoles,
  resolveHubActionPermissions,
  isCoreHubAdmin,
} from './authz/hub'
import {
  authorizeOrganisationCreate,
  authorizeOrganisationManageRoles,
  resolveOrganisationActionPermissions,
} from './authz/organisation'
import {
  authorizeProjectCreate,
  authorizeProjectManageRoles,
  authorizeProjectUpdate,
  authorizeProjectDelete,
  authorizeProjectPublish,
  authorizeProjectManageCapabilities,
  authorizeProjectAssignCapabilities,
} from './authz/project'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { UserAccessOverview, UserAccessResource } from '#lib/users/access.types.js'
import type { CapabilityKey } from '#lib/capabilities.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. RESPONSE HELPERS
// 2. ACCESS OVERVIEW
// ═══════════════════════

/**
 * Selects permitted action labels without duplicating the authorization hierarchy.
 * @param actions Labels paired with authoritative policy decisions.
 * @returns Allowed labels in display order.
 */
function allowedLabels(actions: [string, boolean][]): string[] {
  return actions.filter(([, allowed]) => allowed).map(([label]) => label)
}

/**
 * Reads direct resource assignments and policy-derived management permissions.
 * @param db Request database.
 * @param params Persisted target identity and server-resolved viewer context.
 * @returns Assignments the viewer may inspect, without hidden resource counts.
 * @remarks Self and SuperAdmin may inspect all assignments. Other viewers must be
 * able to manage roles on each resource; profile edit authority is not sufficient.
 * This overview does not enumerate implicit public access or inherited child roles.
 */
export async function readUserAccessOverview(
  db: Database,
  params: { targetUserId: string; actor: SessionUser; userRoles: UserRoleDisco[] },
): Promise<UserAccessOverview> {
  if (
    params.actor.isAnonymous !== false ||
    !canAccessAdminPanel({ ...params.actor, userRoles: params.userRoles })
  ) {
    error(403, 'INSUFFICIENT_ROLE')
  }
  const viewer = {
    userId: params.actor.id,
    userRoles: params.userRoles,
    isAuthenticated: true,
    isAnonymous: false,
    isSuperAdmin: params.actor.superAdmin === true || isCoreHubAdmin(params.userRoles),
  }
  const all = viewer.isSuperAdmin || params.actor.id === params.targetUserId
  const targetRoles = await getUserRoles(db, params.targetUserId)
  const subject = {
    userId: params.targetUserId,
    userRoles: targetRoles,
    isAuthenticated: true,
    isAnonymous: false,
    isSuperAdmin: isCoreHubAdmin(targetRoles),
  }
  const locale = params.actor.locale ?? 'en'
  const result: UserAccessOverview = {
    scope: all ? 'all' : 'managed',
    hubs: [],
    organisations: [],
    projects: [],
  }

  // Resolve names and ancestry from persisted resources, never from client claims.
  const hubs = await db
    .select({
      id: hub.id,
      code: hub.code,
      name: hubI18n.name,
      role: hubRole.role,
      isArchived: hub.isArchived,
    })
    .from(hubRole)
    .innerJoin(hub, eq(hub.id, hubRole.hubId))
    .leftJoin(hubI18n, and(eq(hubI18n.hubId, hub.id), eq(hubI18n.locale, locale)))
    .where(eq(hubRole.userId, params.targetUserId))
    .orderBy(hub.code)
  for (const row of hubs) {
    const target = { resourceId: row.id, resourceHubId: row.id }
    if (!all && !authorizeHubManageRoles(viewer, target).allowed) continue
    const rights = resolveHubActionPermissions(subject, target)
    result.hubs.push({
      ...row,
      name: row.name || row.code,
      parent: null,
      capabilities: [],
      permissions: allowedLabels([
        ['Edit hub', rights.canEdit],
        ['Publish hub', rights.canPublish],
        ['Delete hub', rights.canDelete],
        ['Manage roles', authorizeHubManageRoles(subject, target).allowed],
        ['Create hubs', rights.canCreate],
        [
          'Create organisations',
          authorizeOrganisationCreate(subject, target, ['code']).allowed,
        ],
      ]),
    })
  }
  const organisations = await db
    .select({
      id: organisation.id,
      code: organisation.code,
      name: organisationI18n.name,
      role: organisationRole.role,
      isArchived: organisation.isArchived,
      hubId: organisation.hubId,
      parent: hub.code,
    })
    .from(organisationRole)
    .innerJoin(organisation, eq(organisation.id, organisationRole.organisationId))
    .leftJoin(hub, eq(hub.id, organisation.hubId))
    .leftJoin(
      organisationI18n,
      and(
        eq(organisationI18n.organisationId, organisation.id),
        eq(organisationI18n.locale, locale),
      ),
    )
    .where(eq(organisationRole.userId, params.targetUserId))
    .orderBy(organisation.code)
  for (const { hubId, ...row } of organisations) {
    const target = { resourceId: row.id, resourceHubId: hubId }
    if (!all && !authorizeOrganisationManageRoles(viewer, target).allowed) continue
    const rights = resolveOrganisationActionPermissions(subject, target)
    result.organisations.push({
      ...row,
      name: row.name || row.code,
      capabilities: [],
      permissions: allowedLabels([
        ['Edit organisation', rights.canEdit],
        ['Publish organisation', rights.canPublish],
        ['Delete organisation', rights.canDelete],
        ['Manage roles', authorizeOrganisationManageRoles(subject, target).allowed],
        [
          'Create projects',
          authorizeProjectCreate(
            subject,
            { organisationId: row.id, resourceHubId: hubId },
            ['code'],
          ).allowed,
        ],
      ]),
    })
  }
  const projects = await db
    .select({
      id: project.id,
      code: project.code,
      name: projectI18n.name,
      role: projectRole.role,
      isArchived: project.isArchived,
      organisationId: project.organisationId,
      hubId: organisation.hubId,
      parent: organisation.code,
      assigned: projectRole.capabilities,
      available: project.capabilities,
    })
    .from(projectRole)
    .innerJoin(project, eq(project.id, projectRole.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .leftJoin(
      projectI18n,
      and(eq(projectI18n.projectId, project.id), eq(projectI18n.locale, locale)),
    )
    .where(eq(projectRole.userId, params.targetUserId))
    .orderBy(project.code)
  for (const { hubId, organisationId, assigned, available, ...row } of projects) {
    const target = { resourceId: row.id, resourceHubId: hubId, organisationId }
    if (!all && !authorizeProjectManageRoles(viewer, target).allowed) continue
    const capabilities: UserAccessResource['capabilities'] = []
    for (const key of [
      'manageBakeries',
      'manageVolunteers',
      'manageDropOffs',
      'viewAnalytics',
    ] satisfies CapabilityKey[]) {
      if (assigned?.[key] === true)
        capabilities.push({ key, available: available?.[key] === true })
    }
    const canEdit = authorizeProjectUpdate(subject, target, ['code']).allowed
    result.projects.push({
      ...row,
      name: row.name || row.code,
      capabilities,
      permissions: allowedLabels([
        ['Edit project', canEdit],
        [
          'Translate project',
          !canEdit && authorizeProjectUpdate(subject, target, ['i18n']).allowed,
        ],
        ['Publish project', authorizeProjectPublish(subject, target).allowed],
        ['Delete project', authorizeProjectDelete(subject, target).allowed],
        ['Manage roles', authorizeProjectManageRoles(subject, target).allowed],
        [
          'Configure capabilities',
          authorizeProjectManageCapabilities(subject, target).allowed,
        ],
        [
          'Assign capabilities',
          authorizeProjectAssignCapabilities(subject, target).allowed,
        ],
      ]),
    })
  }
  return result
}
