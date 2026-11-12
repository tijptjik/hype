// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
import { requireLocationOrganisationManager } from './services/locationOwnership'
// DOMAIN
import { IdentityCatalogueContentSchema } from '#lib/locations/identityCatalogue.js'
// SERVICES
import {
  readIdentityCatalogue,
  readIdentityCatalogueByCode,
  searchIdentityCatalogue,
  saveIdentityCatalogue,
} from '#lib/db/services/identityCatalogue.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

/** Authorize community catalogue authoring using existing Organisation-management authority.
 * @param ctx Request session. @param organisationId Persisted editing context.
 * @returns Nothing when authorized.
 */
async function authorize(
  ctx: GuardedBaseContext,
  organisationId?: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (ctx.user.superAdmin) return
  if (!organisationId) error(403, 'ORGANISATION_CONTEXT_REQUIRED')
  await requireLocationOrganisationManager(ctx, organisationId)
}
/** Search the community brand/group catalogue for autocomplete.
 * @param input Kind and typed text. @returns At most fifty localized records.
 */
export const findIdentityCatalogue = guardedQuery(
  z.strictObject({
    kind: z.enum(['brand', 'group']),
    search: z.string().max(200),
    excludeDescendantsOf: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    return searchIdentityCatalogue(
      ctx.db,
      input.kind,
      input.search,
      input.excludeDescendantsOf,
    )
  },
)
/** Read a current catalogue identity for its localized details page.
 * @param input Identity. @returns Localized names and logo.
 */
export const getIdentityCatalogue = guardedQuery(
  z.union([
    z.strictObject({ id: z.string().min(1) }),
    z.strictObject({
      kind: z.enum(['brand', 'group']),
      code: z.string().min(1).max(200),
    }),
  ]),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const record =
      'id' in input
        ? await readIdentityCatalogue(ctx.db, input.id)
        : await readIdentityCatalogueByCode(ctx.db, input.kind, input.code)
    if (!record) error(404, 'CATALOGUE_IDENTITY_NOT_FOUND')
    return record
  },
)
/** Publish a reviewed catalogue revision without rewriting raw upstream evidence.
 * @param input Inspected identity/version, locales and authorised Organisation context.
 * @returns New immutable revision.
 */
export const publishIdentityCatalogue = guardedCommand(
  z.strictObject({
    id: z.string().min(1),
    kind: z.enum(['brand', 'group']),
    expectedVersion: z.number().int().nonnegative(),
    content: IdentityCatalogueContentSchema,
    newGroup: z
      .strictObject({
        id: z.string().uuid(),
        i18n: IdentityCatalogueContentSchema.shape.i18n,
      })
      .optional(),
    organisationId: z.string().optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    const record = await saveIdentityCatalogue(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      guard: sql`1`,
    })
    if (!record) error(409, 'CATALOGUE_VERSION_CHANGED')
    return record
  },
)

/** Upload a small PNG logo into the existing stage-specific asset bucket.
 * @param input Base64 PNG and editing context. @returns An immutable public logo path.
 * @remarks The server validates magic bytes and dimensions; SVG/HTML cannot be uploaded here.
 */
export const uploadIdentityCatalogueLogo = guardedCommand(
  z.strictObject({
    data: z.string().max(1400000),
    organisationId: z.string().optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    const { getDerivedBucketForStage, toImageStage } = await import(
      '#lib/images/storage.js'
    )
    let bytes: Uint8Array
    try {
      bytes = Uint8Array.from(atob(input.data), character => character.charCodeAt(0))
    } catch {
      error(400, 'INVALID_LOGO')
    }
    if (
      bytes.length < 24 ||
      bytes.length > 1024 * 1024 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    )
      error(400, 'INVALID_PNG')
    const view = new DataView(bytes.buffer)
    if (
      view.getUint32(16) > 1024 ||
      view.getUint32(20) > 1024 ||
      !view.getUint32(16) ||
      !view.getUint32(20)
    )
      error(400, 'LOGO_DIMENSIONS')
    const id = crypto.randomUUID()
    const platform = ctx.event.locals.platform
    const bucket = getDerivedBucketForStage(
      platform,
      toImageStage(platform?.env.ENVIRONMENT),
    )
    await bucket.put(`identity-catalogue/${id}.png`, bytes, {
      httpMetadata: { contentType: 'image/png' },
    })
    return { logo: `/api/identity-catalogue/logos/${id}` }
  },
)

/** Backfill imported brand identities through the normal attributed community revision path.
 * @param input Last inspected Location. @returns Progress and retryable failures for a bounded page.
 * @remarks Administrative import only; consumers still apply their community-change policy.
 */
export const importIdentityCatalogue = guardedCommand(
  z.strictObject({ after: z.string().nullable() }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous || !ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    const { importLocationBrandPage } = await import(
      '#lib/db/services/identityCatalogueImport.js'
    )
    return importLocationBrandPage(ctx.db, input.after, ctx.user.id)
  },
)

/** Publish catalogue edits to linked community Locations in bounded pages.
 * @param input Catalogue identity, cursor and authoring context. @returns Publication results and failures.
 */
export const publishIdentityCatalogueLocations = guardedCommand(
  z.strictObject({
    id: z.string().min(1),
    after: z.string().nullable(),
    organisationId: z.string().optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    const { publishCatalogueLocationPage } = await import(
      '#lib/db/services/identityCatalogueImport.js'
    )
    return publishCatalogueLocationPage(ctx.db, input.id, input.after, ctx.user.id)
  },
)
