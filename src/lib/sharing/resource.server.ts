// DRIZZLE
import { and, eq } from 'drizzle-orm'
// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
import {
  getFeatureWithRelations,
  toEntityResponseShape,
} from '#lib/api/services/feature.js'
// DB
import { feature, layer, project, organisation } from '#lib/db/schema/index.js'
import { getFeature } from '#lib/db/services/feature.js'
import { publicShareVisibility } from './visibility.server'
// PRESENTATION
import { getURLfromImage } from '#lib/client/services/image.js'
import { getI18n } from '#lib/i18n.js'
import { sharePath, sharePlainText } from './resource'
// TYPES
import type { ShareKind, ShareResource } from './resource'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

// TABLE OF CONTENTS
// 1. Public visibility and metadata

/** Loads only anonymously visible metadata, regardless of the caller's session.
 * @param locals Request database and resolved hub. @param kind Resource type.
 * @param ref Project/organisation code or layer/feature ID.
 * @returns Public share metadata, or null for unavailable resources.
 * @remarks All ancestors must be published, unarchived and visible in this hub.
 */
export async function loadShareResource(
  locals: App.Locals,
  kind: ShareKind,
  ref: string,
): Promise<ShareResource | null> {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  if (!locals.hub) return null
  const hub = {
    ...locals.hub,
    isSuperAdmin: false,
    isAdminRequest: false,
  } as HubOptsExtended
  const visibility = publicShareVisibility(db, hub)

  // Gate the complete ancestor chain before loading text or image relations.
  if (kind === 'feature') {
    const row = await getFeature(
      db,
      getFeatureWithRelations('card'),
      [and(eq(feature.id, ref), visibility.feature)!],
      hub,
    )
    if (!row) return null
    const { data } = await toEntityResponseShape(row as never, 'card')
    if (!data) return null
    const title = getI18n(data, 'title', undefined, ref)
    const photo = data.image
    return {
      kind,
      ref,
      id: ref,
      path: sharePath({ kind, ref }),
      title,
      description: sharePlainText(getI18n(data, 'description', undefined, '')),
      image: photo
        ? getURLfromImage({ image: photo, format: 'jpeg' })
        : `/api/mapRenders/layers/${encodeURIComponent(data.layerId)}/asset`,
    }
  }

  const row =
    kind === 'organisation'
      ? await db.query.organisation.findFirst({
          where: and(eq(organisation.code, ref), visibility.organisation),
          with: { i18n: true, image: true },
        })
      : kind === 'project'
        ? await db.query.project.findFirst({
            where: and(eq(project.code, ref), visibility.project),
            with: { i18n: true },
          })
        : await db.query.layer.findFirst({
            where: and(eq(layer.id, ref), visibility.layer),
            with: { i18n: true },
          })
  if (!row) return null
  const localized = {
    i18n: Object.fromEntries(row.i18n.map(text => [text.locale, text])),
  }
  const title = getI18n(localized, 'name', undefined, ref)
  let image = '/social/hype-logo-v1.png'
  if (kind === 'project' || kind === 'layer')
    image = `/api/mapRenders/${kind}s/${encodeURIComponent(row.id)}/asset`
  else if ('image' in row && row.image && !row.image.isArchived)
    image = getURLfromImage({
      image: { image: row.image } as ImageCtxEnvelope,
      format: 'jpeg',
    })
  return {
    kind,
    ref,
    id: row.id,
    path: sharePath({ kind, ref }),
    title,
    description: sharePlainText(getI18n(localized, 'description', undefined, '')),
    image,
  }
}
