// TYPES

export type FeatureCardPortalObstacle = {
  top: number
  left: number
  right: number
  bottom: number
  diameter: number
  radius: number
  centerX: number
  centerY: number
}

export type FeatureCardActionDisplay<
  Fields extends object = Record<string, string | undefined>,
> = {
  key: string
  label: string
} & Fields

export type FeatureCardWishlistActionDisplay = FeatureCardActionDisplay<{
  icon: boolean
}>
