export type TextActionProps = {
  text: string
  onClick?: () => void
  separator: string
  padding: number
  tabIndex?: number
  class?: string
}

export type TextTitleProps = {
  text: string
  onClick?: () => void
  tabIndex?: number
}

export type TextDescriptionProps = {
  text: string
  onClick?: () => void
  tabIndex?: number
}
