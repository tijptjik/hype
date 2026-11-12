// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, desc, eq, inArray, or, sql, type SQLWrapper } from 'drizzle-orm'
// AUTH AND SERVICES
import { canReadAdminUserProfile } from './adminUser'
import { canSearchUsers } from './authz/index'
import { getFeatureWithRelations, toEntityResponseShape } from './feature'
import { toUserContributionFeatureScope, toAdminContributionFeatureScope } from './user'
// DB
import { feature, featureImage, image, user } from '#lib/db/schema/index.js'
import { historicalFeatureVisibility } from '#lib/db/services/historicalLayers.js'
import { featureAuthoringSQL } from '#lib/db/services/featureAuthoringProjection.js'
import { featureLocationBrandsSQL } from '#lib/db/services/locationBrandProjection.js'
import { featureLocationNamesSQL } from '#lib/db/services/locationNameProjection.js'
import { featureLocationLifecycleSQL } from '#lib/db/services/locationLifecycleProjection.js'
import { ImageListFields } from '#lib/db/zod/schema/imageList.js'
import { ImageContextResource } from '#lib/enums.js'
import { FeatureListRow } from '#lib/db/zod/schema/feature.js'
import { propertyLocalesToForm } from '#lib/properties/locales.js'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { ImageContextEnvelope } from '#lib/db/zod/schema/image.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Shared scope
// 2. Feature pages
// 3. Photo pages

type ContributionPageParams = {
  userId: string
  ids: string[]
  actor: SessionUser
  userRoles: UserRoleDisco[]
  isAdminRequest: boolean
  hub?: Partial<HubOptsExtended> | null
}

/** Validate a bounded contribution read using the same viewer gate as its profile.
 * @param db Request database.
 * @param params Contributor, requested IDs and server-resolved viewer context.
 * @param max Maximum number of IDs in this page.
 * @returns Readable parent scope and an active contributor subquery.
 * @remarks IDs narrow the query; they never grant access. Admin reads additionally allow unpublished content within live management scope.
 */
function contributionScope(
  db: Database,
  params: ContributionPageParams,
  max: number,
): { scope: SQLWrapper; contributor: SQLWrapper } {
  if (params.ids.length > max) error(400, 'CONTRIBUTION_PAGE_TOO_LARGE')
  if (
    params.userId !== params.actor.id &&
    (params.actor.isAnonymous ||
      (!canSearchUsers({ ...params.actor, userRoles: params.userRoles }) &&
        !(
          params.isAdminRequest &&
          canReadAdminUserProfile({ ...params.actor, userRoles: params.userRoles })
        )))
  )
    error(403, 'INSUFFICIENT_ROLE')
  const publicScope = toUserContributionFeatureScope(db, {
    sessionUser: params.actor,
    hubOpts: params.hub,
    isAdminRequest: params.isAdminRequest,
    includeAdminUnpublished: params.isAdminRequest,
  })
  // Preserve the public app's historical-layer policy as well as profile publication scope.
  const scope = params.isAdminRequest
    ? publicScope
    : db
        .select({ id: feature.id })
        .from(feature)
        .where(and(inArray(feature.id, publicScope), historicalFeatureVisibility()))
  return {
    scope,
    contributor: db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, params.userId), eq(user.isArchived, false))),
  }
}

/** Read a page of feature contributions without per-row probes or count queries.
 * @param db Request database.
 * @param params At most 20 IDs and the server-resolved profile scope.
 * @returns Collection-compatible features for both admin links and map navigation.
 * @remarks One bounded relation query retains translated names, addresses and map properties.
 */
export async function readUserContributedFeatures(
  db: Database,
  params: ContributionPageParams,
): Promise<FeatureFromCollection[]> {
  const { scope, contributor } = contributionScope(db, params, 20)
  if (!params.ids.length) return []
  // Scope every candidate in SQL before hydrating the collection fields in a single query.
  const rows = await db.query.feature.findMany({
    where: and(
      inArray(feature.id, params.ids),
      inArray(feature.id, scope),
      inArray(feature.contributorId, contributor),
    ),
    with: {
      ...getFeatureWithRelations('list'),
      images: {
        where: and(
          or(
            eq(featureImage.isPublished, true),
            params.isAdminRequest
              ? inArray(
                  featureImage.featureId,
                  toAdminContributionFeatureScope(db, params.actor),
                )
              : undefined,
          ),
          inArray(
            featureImage.imageId,
            db.select({ id: image.id }).from(image).where(eq(image.isArchived, false)),
          ),
        ),
        with: { image: true },
      },
    },
    extras: {
      locationBrands: featureLocationBrandsSQL().as('locationBrands'),
      locationNames: featureLocationNamesSQL().as('locationNames'),
      authoring: featureAuthoringSQL().as('authoring'),
      locationLifecycle: featureLocationLifecycleSQL().as('locationLifecycle'),
    },
    orderBy: [desc(feature.createdAt), feature.id],
    limit: 20,
  })
  const results = await Promise.all(
    rows.map(row => {
      // Parse JSON projections while retaining the separately authorized image graph.
      const parsed = {
        ...FeatureListRow.parse({
          ...row,
          addressMeta: row.addressMeta ?? {},
          // Nested definitions use API locale maps; Drizzle returns translation rows.
          properties: row.properties?.map(assignment => ({
            ...assignment,
            property: assignment.property
              ? {
                  ...assignment.property,
                  i18n: propertyLocalesToForm(assignment.property.i18n),
                  values: assignment.property.values?.map(value => ({
                    ...value,
                    i18n: propertyLocalesToForm(value.i18n),
                  })),
                }
              : undefined,
            propertyValue: assignment.propertyValue
              ? {
                  ...assignment.propertyValue,
                  i18n: propertyLocalesToForm(assignment.propertyValue.i18n),
                }
              : null,
          })),
        }),
        images: row.images,
        imageCount: row.images.length,
        imagePublishedCount: row.images.filter(assignment => assignment.isPublished)
          .length,
      }
      return toEntityResponseShape(parsed, 'list')
    }),
  )
  return results.flatMap(result => (result.data ? [result.data] : []))
}

/** Read photo thumbnails with their readable feature assignment in one SQL statement.
 * @param db Request database.
 * @param params At most 24 image IDs and the server-resolved profile scope.
 * @returns Deduplicated readable image envelopes; no per-photo authorization probes.
 * @remarks Publication, contributor and parent hub visibility are checked before returning locators.
 */
export async function readUserContributedImages(
  db: Database,
  params: ContributionPageParams,
): Promise<ImageContextEnvelope[]> {
  const { scope, contributor } = contributionScope(db, params, 24)
  if (!params.ids.length) return []
  // Collapse multiple readable assignments before joining the small image-list projection.
  const readable = db.$with('readableContributionImages').as(
    db
      .select({
        id: featureImage.imageId,
        featureId: sql<string>`min(${featureImage.featureId})`.as('featureId'),
      })
      .from(featureImage)
      .where(
        and(
          inArray(featureImage.imageId, params.ids),
          or(
            eq(featureImage.isPublished, true),
            params.isAdminRequest
              ? inArray(
                  featureImage.featureId,
                  toAdminContributionFeatureScope(db, params.actor),
                )
              : undefined,
          ),
          inArray(featureImage.featureId, scope),
        ),
      )
      .groupBy(featureImage.imageId),
  )
  const rows = await db
    .with(readable)
    .select({
      featureId: readable.featureId,
      image: {
        id: image.id,
        cdn: image.cdn,
        env: image.env,
        cdnId: image.cdnId,
        publicId: image.publicId,
        contentHash: image.contentHash,
        version: image.version,
        presentationMode: image.presentationMode,
        contributorId: image.contributorId,
        createdAt: image.createdAt,
        modifiedAt: image.modifiedAt,
      },
    })
    .from(readable)
    .innerJoin(image, eq(image.id, readable.id))
    .where(and(inArray(image.contributorId, contributor), eq(image.isArchived, false)))
    .orderBy(desc(image.createdAt), image.id)
    .limit(24)
  return rows.map(row => ({
    image: ImageListFields.parse(row.image),
    ctxType: ImageContextResource.feature,
    ctxId: row.featureId,
  }))
}
