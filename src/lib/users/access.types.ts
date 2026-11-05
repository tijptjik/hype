// TYPES
import type { CapabilityKey } from '#lib/capabilities.types.js'

export type UserAccessResource = {
  id: string
  code: string
  name: string
  parent: string | null
  role: string
  isArchived: boolean
  permissions: string[]
  capabilities: { key: CapabilityKey; available: boolean }[]
}

export type UserAccessOverview = {
  scope: 'all' | 'managed'
  hubs: UserAccessResource[]
  organisations: UserAccessResource[]
  projects: UserAccessResource[]
}
