<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import HubSubscriptionOverlayActions from './HubSubscriptionOverlayActions.svelte'
import HubSubscriptionOverlayLegalLinks from './HubSubscriptionOverlayLegalLinks.svelte'
// STYLES
import { getCardSurfaceStyle } from '../hubSubscriptionOverlay.styles'

type Props = {
  title?: string
  description?: string
  hubCode?: string
  hubNameShort?: string
  subscriptionBenefits?: string
  ctaText?: string
  dismissText?: string
  isLoading?: boolean
  isDisabled?: boolean
  privacyText?: string
  termsText?: string
  isExpanded?: boolean
  onJoin?: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
  onPrivacyClick?: () => void
  onTermsClick?: () => void
}

let {
  title = m.hub__subscription_title(),
  description = m.hub__subscription_bar_description({
    hubName: 'this hub',
  }),
  hubCode,
  hubNameShort,
  subscriptionBenefits = '',
  ctaText,
  dismissText,
  isLoading = false,
  isDisabled = false,
  privacyText,
  termsText,
  isExpanded = false,
  onJoin,
  onDismiss,
  onPrivacyClick,
  onTermsClick,
}: Props = $props()

const subscriptionLabel = $derived(
  hubCode === 'hkghostsigns' ? 'Ghosty' : (hubNameShort?.trim() ?? ''),
)
</script>

<div
  class="relative aspect-square overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--color-map-base)_72%,white_8%)] bg-sky-950 transition-transform duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
  style={getCardSurfaceStyle(isExpanded)}
>
  <div
    class="relative grid h-full grid-rows-[auto_1fr_auto] px-6 py-8 min-[529px]:px-8 min-[529px]:py-9"
  >
    <div class="relative pt-12">
      <div class="min-w-0 px-4">
        {#if subscriptionLabel}
          <p
            class="mb-3 text-center font-mono text-[14px] uppercase tracking-[0.3em] text-white/62"
          >
            {subscriptionLabel}
          </p>
        {/if}
        <h3
          class="text-center font-mono text-[2.4rem] leading-[0.92] font-semibold tracking-[-0.06em]"
        >
          {title}
        </h3>

        {#if description}
          <p class="mt-4 text-center text-[15px] leading-6 text-white/74">
            {description}
          </p>
        {/if}
      </div>
    </div>

    <div class="flex flex-col items-center justify-center gap-4 pt-3 text-center">
      <div
        class="max-w-sm rounded-[1.8rem] border bg-[color-mix(in_oklab,var(--color-map-base)_34%,white_10%)] px-4 py-3"
      >
        <p class="text-[11px] uppercase tracking-[0.32em] text-white/72">
          {m.hub__subscription_cta()}
        </p>
        <p class="mt-0.5 px-3 text-sm leading-6 text-white/92">
          {subscriptionBenefits}
        </p>
      </div>

      <div class="flex flex-col items-center gap-3 pt-1">
        <HubSubscriptionOverlayActions
          {ctaText}
          {dismissText}
          {isLoading}
          {isDisabled}
          {onJoin}
          {onDismiss}
        />

        <div class="pt-1">
          <HubSubscriptionOverlayLegalLinks
            {privacyText}
            {termsText}
            {onPrivacyClick}
            {onTermsClick}
          />
        </div>
      </div>
    </div>

    <div class="h-[22px] min-[529px]:h-[34px]" aria-hidden="true"></div>
  </div>
</div>
