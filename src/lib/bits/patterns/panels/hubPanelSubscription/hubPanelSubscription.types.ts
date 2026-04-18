export interface HubPanelSubscriptionProps {
  title?: string
  description?: string
  ctaText?: string
  memberText?: string
  isMember?: boolean
  isLoading?: boolean
  isDisabled?: boolean
  privacyText?: string
  termsText?: string
  onJoin?: () => void | Promise<void>
  onPrivacyClick?: () => void
  onTermsClick?: () => void
}
