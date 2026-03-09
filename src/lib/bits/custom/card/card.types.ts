export interface CardWrapperProps {
  class?: string
  isAnimated?: boolean
  flipDisabled?: boolean
}

export interface CardRootProps {
  class?: string
}

export interface CardAvatarProps {
  name?: string | null
  image?: string | null
  class?: string
  imageClass?: string
  fallbackClass?: string
}
