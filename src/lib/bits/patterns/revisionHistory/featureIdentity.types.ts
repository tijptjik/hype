// TYPES
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

export type IdentitySource = {
  proposalOnly?: boolean
  featureId: string
  revisionId: string
  generation: number
  content: FeatureRevisionContent
}
export type IdentityOutput = {
  featureId: string | null
  sourceFeatureId: string
  titles: Record<string, string>
  images: { sourceFeatureId: string; imageId: string }[]
  properties: { sourceFeatureId: string; propertyId: string }[]
  coverImageId?: string
}

/** Read a human label from inspected content. @param source Inspected source. @returns Title with an identity fallback. */
export function identityTitle(source: IdentitySource): string {
  return (
    source.content.translations.en?.title.value ||
    Object.values(source.content.translations)[0]?.title.value ||
    source.featureId
  )
}

/** Resolve an immutable photo under its inspected source authority. @param source Inspected source. @param imageId Selected photo. @returns Revision image URL. */
export function identityPhoto(source: IdentitySource, imageId: string): string {
  return `/api/images/revisions/${encodeURIComponent(source.content.gallery.entries[imageId].imageRevisionId)}${source.proposalOnly ? '' : `?feature=${encodeURIComponent(source.featureId)}`}`
}
