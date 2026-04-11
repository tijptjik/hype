<script lang="ts">
// COMPONENTS
import HubSubscriptionOverlayActions from './HubSubscriptionOverlayActions.svelte'
import HubSubscriptionOverlayLegalLinks from './HubSubscriptionOverlayLegalLinks.svelte'
// STYLES
import { getCardSurfaceStyle } from '../hubSubscriptionOverlay.styles'

type Props = {
  title?: string
  description?: string
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
  title = 'Stay in the loop',
  description = 'Subscribe for this hub news and releases.',
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
        <p
          class="mb-3 text-center font-mono text-[14px] uppercase tracking-[0.3em] text-white/62"
        >
          Ghosty updates
        </p>
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
          Subscribers Get
        </p>
        <p class="mt-0.5 px-3 text-sm leading-6 text-white/92">
          Deep dives, neighborhood highlights, and special announcements
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
