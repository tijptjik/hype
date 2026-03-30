export type UserAttributionCardProps = {
  userId: string | null
  date?: string
  type?: 'contributor' | 'publisher' | 'imageContributor'
  friendlyDate?: boolean
  openDirection?: 'left' | 'right'
  isOpen?: boolean
  hideDetails?: boolean
  class?: string
}
