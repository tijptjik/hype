export type LoadScreenColor = 'primary' | 'accent'
export type LoadScreenSurface = 'transparent' | 'base'

export interface LoadScreenProps {
  /** Optional status text shown in place of the loading animation. */
  label?: string
  color?: LoadScreenColor
  surface?: LoadScreenSurface
}
