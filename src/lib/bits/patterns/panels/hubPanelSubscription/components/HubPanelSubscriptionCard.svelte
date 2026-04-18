<script lang="ts">
// BITS
import { Button } from '$lib/bits/core'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import { HubPanelSubscriptionLegalLinks } from './index'

type Props = {
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

let {
  title = m.hub__subscription_title(),
  description = m.hub__subscription_panel_description({
    hubName: 'this hub',
  }),
  ctaText = m.hub__subscription_cta(),
  memberText = m.hub__subscription_member(),
  isMember = false,
  isLoading = false,
  isDisabled = false,
  privacyText,
  termsText,
  onJoin,
  onPrivacyClick,
  onTermsClick,
}: Props = $props()
</script>

<section class="py-4">
  <div class="space-y-3">
    <div class="space-y-1">
      <h3 class="text-sm font-semibold uppercase tracking-[0.2em] text-base-content/70">
        {title}
      </h3>
      <p class="text-sm leading-6 text-base-content/80">{description}</p>
    </div>

    <Button
      text={isMember ? memberText : `${ctaText}${isLoading ? '…' : ''}`}
      color={isMember ? 'success' : 'primary'}
      style={isMember ? 'soft' : 'solid'}
      modifier="block"
      disabled={isDisabled || isLoading || isMember}
      onClick={() => onJoin?.()}
    />

    <HubPanelSubscriptionLegalLinks
      {privacyText}
      {termsText}
      {onPrivacyClick}
      {onTermsClick}
    />
  </div>
</section>
