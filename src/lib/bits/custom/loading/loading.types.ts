export type LoadScreenColor = 'primary' | 'accent'
export type LoadScreenSurface = 'transparent' | 'base'

export interface LoadScreenProps {
  /** Resolved hub identity; animation branding is independent of the theme. */
  hubCode?: string | null
  /** Optional status text shown in place of the loading animation. */
  label?: string
  color?: LoadScreenColor
  surface?: LoadScreenSurface
}
