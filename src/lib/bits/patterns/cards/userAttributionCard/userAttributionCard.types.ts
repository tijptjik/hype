export type UserAttributionCardProps = {
  userId: string | null
  date?: string
  type?: 'contributor' | 'publisher' | 'imageContributor'
  friendlyDate?: boolean
  class?: string
}
