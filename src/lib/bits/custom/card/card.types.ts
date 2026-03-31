export interface CardWrapperProps {
  class?: string
  isAnimated?: boolean
  flipDisabled?: boolean
}

export type CardSize = 'sm' | 'md' | 'lg' | 'xl'
export type CardActionsPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type CardActionsBg = 'none' | 'subtle' | 'panel' | 'contrast'

export interface CardRootProps {
  class?: string
  size?: CardSize
  isDraggable?: boolean
  reserveDragSpace?: boolean
}

export interface CardMediaProps {
  name?: string | null
  image?: string | null
  class?: string
  imageClass?: string
  fallbackClass?: string
  size?: CardSize
  loading?: 'eager' | 'lazy'
}

export interface CardBodyProps {
  code?: string | null
  title: string
  description?: string | null
  maxDescriptionLines?: number
  class?: string
}

export interface CardActionsProps {
  class?: string
  padding?: CardActionsPadding
  bg?: CardActionsBg
  gap?: number
}
