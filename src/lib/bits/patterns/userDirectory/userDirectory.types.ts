import type { UserSearchQueryParams } from '#lib/db/zod/schema/user.types.js'

export type DirectoryFilters = Omit<
  NonNullable<UserSearchQueryParams['conditions']>,
  'isArchived' | 'hasEmail' | 'hasTelephone'
>

export type DirectoryUser = {
  id: string
  name: string | null
  username: string | null
  displayUsername: string | null
  email: string | null
  attribution: string | null
  telephone?: string | null
  hasMessagingIdentity?: boolean
  locale?: string
  emailVerified?: boolean | null
  isArchived?: boolean
  createdAt?: Date
  image: unknown
}

export type DirectoryJoinedRange = { from: number; to: number }
