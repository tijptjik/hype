// TYPES
import type { Id } from '$lib/types'

export type EventCompanionPlatform = 'instagram' | 'linkedin' | 'facebook' | 'web'

export type EventCompanionRole = 'host' | 'author' | 'performer'

type EventCompanionFollowLink = {
  label: string
  href: string
  platform: EventCompanionPlatform
}

type EventCompanionSession = {
  featureId: Id
  title: string
  addressLine: string
  imageUrl: string | null
  buyHref: string
  follows: Record<EventCompanionRole, EventCompanionFollowLink | null>
}
