import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

export interface HubSubscriptionOverlayProps {
  title?: string
  description?: string
  hubCode?: string
  hubNameShort?: string
  subscriptionBenefits?: string
  featureImages?: ImageCtxEnvelope[]
  ctaText?: string
  dismissText?: string
  isLoading?: boolean
  isDisabled?: boolean
  privacyText?: string
  termsText?: string
  onJoin?: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
  onPrivacyClick?: () => void
  onTermsClick?: () => void
}
