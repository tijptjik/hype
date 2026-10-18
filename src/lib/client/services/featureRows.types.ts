// TYPES

export type FeatureRowStatMap = Record<string, boolean | null>

export type FeatureRowModel = {
  id: string
  title: string
  description: string
  imageAlt: string
  isPublished: boolean
  isPendingReview: boolean
  stats: {
    status: FeatureRowStatMap
    content: FeatureRowStatMap
    translation: FeatureRowStatMap
    image: FeatureRowStatMap
    category: FeatureRowStatMap
    freeform: FeatureRowStatMap
  }
}
