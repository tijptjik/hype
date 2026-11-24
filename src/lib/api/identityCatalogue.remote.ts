import { LogoQualityFiltersSchema } from '#lib/locations/catalogueQuality.js'
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
  listGroupBrands,
  listSubgroups,
  readIdentityCatalogue,
  readIdentityCatalogueByCode,
  searchIdentityCatalogue,
  saveIdentityCatalogue,
} from '#lib/db/services/identityCatalogue.js'
import {
  WikidataIdSchema,
  searchWikidataBrands,
  readWikidataBrand,
} from './services/wikidataBrands'
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
    isArchived: z.boolean().nullable().optional(),
    independent: z.boolean().nullable().optional(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    if (
      input.isArchived !== undefined &&
      input.isArchived !== false &&
      !ctx.user.superAdmin
    )
      error(403, 'INSUFFICIENT_ROLE')
    return searchIdentityCatalogue(
      ctx.db,
      input.kind,
      input.search,
      input.excludeDescendantsOf,
      input.isArchived,
      input.independent,
    )
  },
)
/** List a stable page of brands or groups.
 * @param input Search, filters and optional continuation cursor.
 * @returns Fifty records and a cursor when another page exists.
 */
export const listIdentityCatalogue = guardedQuery(
  z.strictObject({
    kind: z.enum(['brand', 'group']),
    search: z.string().max(200),
    isArchived: z.boolean().nullable().optional(),
    independent: z.boolean().nullable().optional(),
    after: z.object({ name: z.string(), id: z.string().min(1).max(200) }).optional(),
    quality: LogoQualityFiltersSchema.optional(),
    origin: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    if (
      input.isArchived !== undefined &&
      input.isArchived !== false &&
      !ctx.user.superAdmin
    )
      error(403, 'INSUFFICIENT_ROLE')
    const rows = await searchIdentityCatalogue(
      ctx.db,
      input.kind,
      input.search,
      undefined,
      input.isArchived,
      input.independent,
      { after: input.after, quality: input.quality, origin: input.origin },
    )
    const records = rows.slice(0, 50)
    const last = records.at(-1)
    return {
      records,
      nextCursor:
        rows.length > 50 && last
          ? { name: last.i18n.en?.name ?? '', id: last.id }
          : null,
    }
  },
)
/** Read the current brands belonging to a group profile.
 * @param input Group identity and optional wider-family sibling discovery.
 * @returns Linked localized brands, including intermediate groups.
 */
export const getGroupBrands = guardedQuery(
  z.strictObject({
    groupId: z.string().min(1).max(200),
    includeAncestors: z.boolean().optional(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    return listGroupBrands(ctx.db, input.groupId, input.includeAncestors)
  },
)
/** Read direct subgroups for a group profile.
 * @param input Parent group identity. @returns Current localized child groups.
 */
export const getSubgroups = guardedQuery(
  z.strictObject({ groupId: z.string().min(1).max(200) }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    return listSubgroups(ctx.db, input.groupId)
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
    wikidataId: WikidataIdSchema.optional(),
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
    const previous = await readIdentityCatalogue(ctx.db, input.id)
    if (previous?.isArchived || input.content.isArchived)
      error(403, 'CATALOGUE_ARCHIVE_ACTION_REQUIRED')
    if (input.wikidataId) {
      if (input.kind !== 'brand')
        error(400, 'Wikidata linking is available for brands.')
      await readWikidataBrand(input.wikidataId, fetch, false)
    }
    const record = await saveIdentityCatalogue(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      guard: sql`1`,
    }).catch(cause => {
      if (cause instanceof Error && cause.message === 'WIKIDATA_BRAND_ALREADY_LINKED')
        error(
          409,
          'This Wikidata identity or brand already has a different link. Review the existing catalogue brand.',
        )
      throw cause
    })
    if (!record) error(409, 'CATALOGUE_VERSION_CHANGED')
    return record
  },
)

/** Archive or restore a catalogue identity without deleting its history or Location links.
 * @param input Identity, inspected version, and desired archive state.
 * @returns The new immutable catalogue revision.
 * @remarks Only SuperAdmin may change archive state; normal authoring cannot bypass this command.
 */
export const archiveIdentityCatalogue = guardedCommand(
  z.strictObject({
    id: z.string().min(1).max(200),
    expectedVersion: z.number().int().positive(),
    isArchived: z.boolean(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous || !ctx.user.superAdmin) error(403, 'SUPERADMIN_REQUIRED')
    const previous = await readIdentityCatalogue(ctx.db, input.id)
    if (!previous) error(404, 'CATALOGUE_NOT_FOUND')
    if (previous.version !== input.expectedVersion)
      error(409, 'CATALOGUE_VERSION_CHANGED')
    const { id, kind, version, wikidataId, ...content } = previous
    const record = await saveIdentityCatalogue(ctx.db, {
      id,
      kind,
      expectedVersion: version,
      content: { ...content, isArchived: input.isArchived },
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
      Math.min(view.getUint32(16), view.getUint32(20)) < 512 ||
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

/** Search public Wikidata entities for an explicit catalogue identity choice.
 * @param input Brand search text. @returns Candidate labels and descriptions.
 */
export const findWikidataBrands = guardedQuery(
  z.strictObject({ search: z.string().trim().min(2).max(200) }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    return searchWikidataBrands(input.search)
  },
)

/** Preview a selected entity and its available Commons logo without saving anything.
 * @param input Exact Wikidata identifier. @returns Entity and optional logo attribution.
 */
export const getWikidataBrand = guardedQuery(
  z.strictObject({ id: WikidataIdSchema }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    return readWikidataBrand(input.id)
  },
)

/** List recorded catalogue source namespaces for the Origin filter.
 * @param kind Catalogue kind. @returns Distinct recorded sources.
 */
export const listIdentityCatalogueOrigins = guardedQuery(
  z.enum(['brand', 'group']),
  async (kind, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const rows = await ctx.db.all<{ source: string }>(
      sql`SELECT DISTINCT s.source FROM identityCatalogueSource s JOIN identityCatalogue c ON c.id=s.catalogueId WHERE c.kind=${kind} ORDER BY s.source`,
    )
    return rows.map(row => row.source)
  },
)
