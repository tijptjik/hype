// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
import { changelogQueryFields } from '#lib/revisions/changelogSchema.js'
// API
import { guardedQuery } from './server/guarded'
// SERVICES
import { canReadUserChangelog } from '#lib/db/services/userChangelogScope.js'
import { listResourceChangelog } from '#lib/db/services/resourceChangelog.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
// TYPES
import type { ChangelogPage } from '#lib/revisions/changelog.js'

/** Read a current administrator's authored changes inside the viewer's live scope.
 * @param input Profile subject, locale, bounded filters and continuation cursor.
 * @returns Only authorized accepted changes, including privacy-filtered comparisons.
 * @remarks Subject eligibility and viewer scope are repeated in every database branch.
 * No delegated capability is implied by organisation membership or profile-edit access.
 */
export const getUserChangelog = guardedQuery(
  z.strictObject({
    userId: z.string().min(1).max(256),
    ...changelogQueryFields,
    meta: z.strictObject({ isAdminRequest: z.boolean() }).optional(),
  }),
  async (input, ctx): Promise<ChangelogPage> => {
    const scope = { resource: 'user' as const, id: input.userId, viewerId: ctx.user.id }
    if (ctx.user.isAnonymous || !(await canReadUserChangelog(ctx.db, scope)))
      error(403, 'INSUFFICIENT_ROLE')
    const access = await getInternalPropertyAccess(ctx)
    const result = await listResourceChangelog(ctx.db, {
      scope,
      locales: [
        input.locale,
        ...['en', 'zhHant', 'zhHans'].filter(locale => locale !== input.locale),
      ],
      before: input.before,
      filters: input.filters,
      includeFilterOptions: input.includeFilterOptions,
      // User scopes authorize each branch in SQL before it contributes rows or metadata.
      authorize: () => true,
      internalIds: access.internal,
      allowedInternalIds: access.allowed,
    })
    // A subject losing their last staff role also invalidates an in-flight page.
    if (!(await canReadUserChangelog(ctx.db, scope))) error(403, 'INSUFFICIENT_ROLE')
    return {
      ...result,
      owner: { id: input.userId, name: 'Change log' },
      checkpoint: { lastCheckedAt: null, checkedThrough: new Date().toISOString() },
    }
  },
)
