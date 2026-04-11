<script lang="ts">
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// COMPONENTS
import * as HubSubscriptionOverlayPrimitive from './components'
// STYLES
import {
  getCardScaleStyle,
  getCardViewportStyle,
  getMobileCardMarginX,
  getMobileCardScale,
} from './hubSubscriptionOverlay.styles'
// UTILS
import { getDecorativeFeatureImages } from './hubSubscriptionOverlay.utils'
// TYPES
import type { HubSubscriptionOverlayProps } from './hubSubscriptionOverlay.types'

let {
  title = 'Stay in the loop',
  description = 'Subscribe for this hub news and releases.',
  featureImages = [],
  ctaText,
  dismissText,
  isLoading,
  isDisabled,
  privacyText,
  termsText,
  onJoin,
  onDismiss,
  onPrivacyClick,
  onTermsClick,
}: HubSubscriptionOverlayProps = $props()

const responsiveCtx = getResponsiveCtx()
const effectiveBarWidth = $derived(responsiveCtx.getEffectiveAppMainWidth())
let areDecorativeImagesExpanded = $state(false)
let isCardSurfaceExpanded = $state(false)
let decorativeImageShuffleSeed = $state(Math.random())

const DECORATIVE_IMAGE_LIMIT = 20
const MOBILE_BAR_BASE_WIDTH_PX = 480
const MOBILE_BAR_MIN_EFFECTIVE_WIDTH_PX = 320
const MOBILE_BAR_MAX_EFFECTIVE_WIDTH_PX = 528
const MOBILE_BAR_MIN_MARGIN_PX = -24
const MOBILE_BAR_MAX_MARGIN_PX = 24

const decorativeFeatureImages = $derived.by(() =>
  getDecorativeFeatureImages(
    featureImages,
    decorativeImageShuffleSeed,
    DECORATIVE_IMAGE_LIMIT,
  ),
)

// Interpolate the mobile circle inset from -24px at 320px wide to 24px at 528px wide.
const mobileCardMarginX = $derived.by(() => {
  return getMobileCardMarginX({
    isMobile: responsiveCtx.isMobile,
    effectiveBarWidth,
    minEffectiveWidth: MOBILE_BAR_MIN_EFFECTIVE_WIDTH_PX,
    maxEffectiveWidth: MOBILE_BAR_MAX_EFFECTIVE_WIDTH_PX,
    minMarginX: MOBILE_BAR_MIN_MARGIN_PX,
    maxMarginX: MOBILE_BAR_MAX_MARGIN_PX,
  })
})

const mobileCardScale = $derived.by(() => {
  return getMobileCardScale({
    isMobile: responsiveCtx.isMobile,
    effectiveBarWidth,
    marginX: mobileCardMarginX,
    baseWidth: MOBILE_BAR_BASE_WIDTH_PX,
  })
})

const cardViewportStyle = $derived.by(() => {
  return getCardViewportStyle(
    responsiveCtx.isMobile,
    MOBILE_BAR_BASE_WIDTH_PX,
    mobileCardScale,
  )
})

const cardScaleStyle = $derived.by(() => {
  return getCardScaleStyle(
    responsiveCtx.isMobile,
    MOBILE_BAR_BASE_WIDTH_PX,
    mobileCardScale,
  )
})

$effect(() => {
  if (areDecorativeImagesExpanded || decorativeFeatureImages.length > 0) {
    return
  }

  const animationFrame = requestAnimationFrame(() => {
    isCardSurfaceExpanded = true
    areDecorativeImagesExpanded = true
  })

  return () => cancelAnimationFrame(animationFrame)
})

function handleDecorativeOrbitReady(): void {
  if (areDecorativeImagesExpanded) {
    return
  }

  requestAnimationFrame(() => {
    isCardSurfaceExpanded = true
    areDecorativeImagesExpanded = true
  })
}
</script>

<section
  class="relative isolate mx-auto w-full text-white"
  style={`max-width: min(100%, ${Math.min(effectiveBarWidth, 680)}px);`}
>
  <div class="px-6 py-6 md:px-24 md:py-24">
    <div
      class="relative mx-auto aspect-square w-full max-w-[480px] overflow-visible min-[529px]:w-[480px]"
      style={cardViewportStyle}
    >
      <div class="relative aspect-square w-full" style={cardScaleStyle}>
        <HubSubscriptionOverlayPrimitive.HubSubscriptionOverlayOrbit
          {decorativeFeatureImages}
          {areDecorativeImagesExpanded}
          {isCardSurfaceExpanded}
          dismissText={dismissText ?? 'Close'}
          {isLoading}
          {isDisabled}
          {onDismiss}
          onReady={handleDecorativeOrbitReady}
        >
          <HubSubscriptionOverlayPrimitive.HubSubscriptionOverlayCard
            {title}
            {description}
            {ctaText}
            {dismissText}
            {isLoading}
            {isDisabled}
            {privacyText}
            {termsText}
            isExpanded={isCardSurfaceExpanded}
            {onJoin}
            {onDismiss}
            {onPrivacyClick}
            {onTermsClick}
          />
        </HubSubscriptionOverlayPrimitive.HubSubscriptionOverlayOrbit>
      </div>
    </div>
  </div>
</section>
