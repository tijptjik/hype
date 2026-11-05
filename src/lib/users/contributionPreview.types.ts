/** Minimal display data for a bounded profile contribution strip. */
export type UserContributionPreview = {
  id: string
  kind: 'feature' | 'photo'
  featureId: string
  imageId: string | null
  title: string
  image: {
    id: string
    cdn: string
    env: string
    publicId: string
    version: number | null
  } | null
}
