export interface AvatarProps {
  name?: string | null
  src?: string | null
  alt?: string
  fallback?: string
  shape?: 'circle' | 'square'
  fitHeight?: boolean
  class?: string
}
