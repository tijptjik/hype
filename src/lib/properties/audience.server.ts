// FRAMEWORK
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
// SCHEMA
import { property, project, organisation } from '#lib/db/schema/index.js'
// AUTHORIZATION
import { authorizeProjectUpdateForSubmission } from '#lib/api/services/authz/project.js'
import { authorizeOrganisationUpdateForSubmission } from '#lib/api/services/authz/organisation.js'
import { authorizeHubUpdateForSubmission } from '#lib/api/services/authz/hub.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. REQUEST-LOCAL ACCESS
// 2. RESPONSE PROJECTION
// 3. FILTER PROTECTION
// ═══════════════════════
const requests = new WeakMap<
  GuardedBaseContext,
  Promise<{ internal: Set<string>; allowed: Set<string> }>
>()

/**
 * Resolve internal-field access against persisted ownership and existing editor policies.
 * @param ctx Request-local authenticated context; admin intent is not authorization.
 * @returns All internal IDs and the subset this editor may access.
 * @remarks Public surfaces always omit internal fields, even for an administrator.
 */
export function getInternalPropertyAccess(
  ctx: GuardedBaseContext,
): Promise<{ internal: Set<string>; allowed: Set<string> }> {
  let result = requests.get(ctx)
  if (!result) {
    result = resolveAccess(ctx)
    requests.set(ctx, result)
  }
  return result
}

/**
 * Resolve persisted scope once per internal property catalogue in this request.
 * @param ctx Authenticated request context.
 * @returns Persisted internal IDs and the authorized subset.
 */
async function resolveAccess(
  ctx: GuardedBaseContext,
): Promise<{ internal: Set<string>; allowed: Set<string> }> {
  const rows = await ctx.db.query.property.findMany({
    where: eq(property.audience, 'internal'),
  })
  const internal = new Set<string>()
  const allowed = new Set<string>()
  const decisions = new Map<string, boolean>()
  for (const row of rows) {
    if (row.audience !== 'internal') continue
    internal.add(row.id)
    if (!ctx.isAdminRequest || ctx.user.isAnonymous) continue
    const scopeId = row.projectId ?? row.organisationId ?? row.hubId
    const key = `${row.scope}:${scopeId}`
    let mayRead = decisions.get(key)
    if (mayRead === undefined) {
      mayRead = false
      const actor = {
        user: ctx.user,
        userRoles: ctx.userRoles,
        submittedData: { properties: [] },
      }
      if (row.scope === 'project' && row.projectId) {
        const owner = await ctx.db.query.project.findFirst({
          where: eq(project.id, row.projectId),
        })
        if (owner) {
          const parent = await ctx.db.query.organisation.findFirst({
            where: eq(organisation.id, owner.organisationId),
          })
          mayRead = authorizeProjectUpdateForSubmission({
            ...actor,
            resource: { ...owner, hubId: parent?.hubId ?? null },
          }).allowed
        }
      } else if (row.scope === 'organisation' && row.organisationId) {
        const owner = await ctx.db.query.organisation.findFirst({
          where: eq(organisation.id, row.organisationId),
        })
        if (owner)
          mayRead = authorizeOrganisationUpdateForSubmission({
            ...actor,
            resource: owner,
          }).allowed
      } else if (row.scope === 'hub' && row.hubId) {
        mayRead = authorizeHubUpdateForSubmission({
          ...actor,
          submittedData: { code: true },
          resource: { id: row.hubId },
        }).allowed
      }
      decisions.set(key, mayRead)
    }
    if (mayRead) allowed.add(row.id)
  }
  return { internal, allowed }
}

/**
 * Remove forbidden definitions, values and bare assignments from a response graph.
 * @param value Remote response containing plain data.
 * @param denied IDs derived from persisted audience and scope authorization.
 * @returns A copy with forbidden rows removed, including nested profiles.
 */
export function projectPropertyAudience<T>(value: T, denied: ReadonlySet<string>): T {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit).filter(item => item !== undefined)
    if (
      !input ||
      typeof input !== 'object' ||
      Object.getPrototypeOf(input) !== Object.prototype
    )
      return input
    const row = input as Record<string, unknown>
    if (
      (typeof row.propertyId === 'string' && denied.has(row.propertyId)) ||
      (typeof row.id === 'string' && denied.has(row.id))
    )
      return undefined
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !denied.has(key))
        .map(([key, item]) => [key, visit(item) ?? null]),
    )
  }
  return (visit(value) ?? null) as T
}

/**
 * Detect property-bearing graphs without adding catalogue reads to unrelated queries.
 * @param value Candidate response graph.
 * @returns Whether audience projection is needed.
 */
function containsProperties(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProperties)
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false
  const row = value as Record<string, unknown>
  return (
    'properties' in row ||
    'propertyId' in row ||
    'audience' in row ||
    Object.values(row).some(containsProperties)
  )
}

/**
 * Apply audience projection at the remote boundary, including admin-profile forgery.
 * @param value Authorized handler response.
 * @param ctx Request-local scope and identity.
 * @returns Safe response for the requested surface and actual editor permissions.
 */
export async function protectPropertyResponse<T>(
  value: T,
  ctx: GuardedBaseContext,
): Promise<T> {
  if (!containsProperties(value)) return value
  const { internal, allowed } = await getInternalPropertyAccess(ctx)
  return projectPropertyAudience(
    value,
    new Set([...internal].filter(id => !allowed.has(id))),
  )
}

/**
 * Reject internal property predicates before they can affect public counts or search.
 * @param input Query parameters, not a mutation payload.
 * @param ctx Request-local authorization context.
 * @returns Resolves when no forbidden property predicate is present.
 */
export async function protectPropertyFilters(
  input: unknown,
  ctx: GuardedBaseContext,
): Promise<void> {
  if (!input || typeof input !== 'object') return
  const encoded = JSON.stringify(input)
  if (!encoded.includes('properties') && !encoded.includes('propertyId')) return
  const { internal, allowed } = await getInternalPropertyAccess(ctx)
  const forbidden = new Set([...internal].filter(id => !allowed.has(id)))
  const contains = (value: unknown): boolean => {
    if (typeof value === 'string') return forbidden.has(value)
    if (Array.isArray(value)) return value.some(contains)
    return Boolean(
      value &&
        typeof value === 'object' &&
        Object.entries(value).some(
          ([key, item]) => forbidden.has(key) || contains(item),
        ),
    )
  }
  if (contains(input)) throw error(403, 'PROPERTY_NOT_AVAILABLE')
}
