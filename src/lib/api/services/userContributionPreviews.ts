// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
// DB
import {
  feature,
  featureI18n,
  featureImage,
  image,
  user,
} from '#lib/db/schema/index.js'
// AUTH AND SCOPE
import { canReadAdminUserProfile } from './adminUser'
import { toUserContributionFeatureScope } from './user'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { UserContributionPreview } from '#lib/users/contributionPreview.types.js'

/**
 * Loads seven recent, readable contributions for an admin profile's visual strip.
 * @param db Request database.
 * @param params Contributor, authenticated viewer, locale and server-resolved hub.
 * @returns At most seven titles, image locators and navigation identifiers.
 * @remarks Uses the profile's published contribution scope. Limits candidates before
 * reading labels and thumbnails; no feature graph or per-item remote reads are needed.
 */
export async function readUserContributionPreviews(
  db: Database,
  params: {
    userId: string
    actor: SessionUser
    userRoles: UserRoleDisco[]
    locale: string
    hub?: Partial<HubOptsExtended> | null
  },
): Promise<UserContributionPreview[]> {
  if (!canReadAdminUserProfile({ ...params.actor, userRoles: params.userRoles }))
    error(403, 'INSUFFICIENT_ROLE')

  const scope = toUserContributionFeatureScope(db, {
    sessionUser: params.actor,
    hubOpts: params.hub,
    isAdminRequest: true,
  })
  const contributor = db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, params.userId), eq(user.isArchived, false)))

  // Collapse multiple readable assignments of the same photo before applying the cap.
  const photos = db
    .select({
      id: sql<string>`${image.id}`.as('contributionId'),
      kind: sql<'feature' | 'photo'>`'photo'`.as('kind'),
      featureId: sql<string>`min(${featureImage.featureId})`.as('previewFeatureId'),
      imageId: sql<string | null>`${image.id}`.as('previewImageId'),
      createdAt: sql<string>`${image.createdAt}`.as('previewCreatedAt'),
    })
    .from(image)
    .innerJoin(featureImage, eq(featureImage.imageId, image.id))
    .where(
      and(
        inArray(image.contributorId, contributor),
        eq(image.isArchived, false),
        eq(featureImage.isPublished, true),
        inArray(featureImage.featureId, scope),
      ),
    )
    .groupBy(image.id)
  const recent = db.$with('recentContributions').as(
    db
      .select({
        id: sql<string>`${feature.id}`.as('contributionId'),
        kind: sql<'feature' | 'photo'>`'feature'`.as('kind'),
        featureId: sql<string>`${feature.id}`.as('previewFeatureId'),
        imageId: sql<string | null>`null`.as('previewImageId'),
        createdAt: sql<string>`${feature.createdAt}`.as('previewCreatedAt'),
      })
      .from(feature)
      .where(
        and(inArray(feature.contributorId, contributor), inArray(feature.id, scope)),
      )
      .unionAll(photos)
      .orderBy(desc(sql`previewCreatedAt`), sql`kind`, sql`contributionId`)
      .limit(7),
  )

  // Resolve one published thumbnail and one translated title only for the seven candidates.
  const thumbnailId = sql<string | null>`coalesce(${recent.imageId}, (
    select fi.imageId from featureImage fi
    inner join image thumbnail on thumbnail.id = fi.imageId
    where fi.featureId = ${recent.featureId}
      and fi.isPublished = 1 and thumbnail.isArchived = 0
    order by (fi.intent = 'canonical') desc, thumbnail.createdAt desc, fi.imageId
    limit 1
  ))`
  return db
    .with(recent)
    .select({
      id: recent.id,
      kind: recent.kind,
      featureId: recent.featureId,
      imageId: recent.imageId,
      title: sql<string>`coalesce((
      select ${featureI18n.title} from ${featureI18n}
      where ${featureI18n.featureId} = ${recent.featureId} and ${featureI18n.title} != ''
      order by (${featureI18n.locale} = ${params.locale}) desc,
        (${featureI18n.locale} = 'en') desc, ${featureI18n.locale}
      limit 1
    ), '')`,
      image: {
        id: image.id,
        cdn: image.cdn,
        env: image.env,
        publicId: image.publicId,
        version: image.version,
      },
    })
    .from(recent)
    .leftJoin(image, eq(image.id, thumbnailId))
    .orderBy(desc(recent.createdAt), sql`${recent.kind}`, sql`${recent.id}`)
}
