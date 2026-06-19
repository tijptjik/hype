export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error'

export type BadgeProps = {
  text: string
  tone?: BadgeTone
  class?: string
}
