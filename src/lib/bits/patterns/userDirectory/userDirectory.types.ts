export type DirectoryUser = {
  id: string
  name: string | null
  username: string | null
  displayUsername: string | null
  email: string | null
  attribution: string | null
  telephone?: string | null
  locale?: string
  emailVerified?: boolean | null
  isArchived?: boolean
  createdAt?: Date
  image: unknown
}
