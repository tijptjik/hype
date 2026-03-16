export type LoadScreenColor = 'primary' | 'accent'
export type LoadScreenSurface = 'transparent' | 'base'

export interface LoadScreenProps {
  color?: LoadScreenColor
  surface?: LoadScreenSurface
}
