import { getDecorativeImageDelay } from './hubSubscriptionOverlay.utils'

type MobileCardMarginParams = {
  isMobile: boolean
  effectiveBarWidth: number
  minEffectiveWidth: number
  maxEffectiveWidth: number
  minMarginX: number
  maxMarginX: number
}

type MobileCardScaleParams = {
  isMobile: boolean
  effectiveBarWidth: number
  marginX: number
  baseWidth: number
}

type DismissButtonStyleParams = {
  angleDegrees: number
  orbitRadius: number
  isExpanded: boolean
}

type DecorativeImageStyleParams = {
  index: number
  count: number
  orbitRadius: number
  hoverOffsetRatio: number
  isExpanded: boolean
  activeIndex: number | null
}

/**
 * Interpolates the horizontal mobile inset so the circular card can breathe at narrow widths.
 *
 * @param params - Mobile sizing inputs.
 * @returns Margin in pixels for the scaled card viewport.
 */
export function getMobileCardMarginX(params: MobileCardMarginParams): number {
  if (!params.isMobile || params.effectiveBarWidth <= 0) {
    return params.maxMarginX
  }

  const clampedWidth = Math.min(
    Math.max(params.effectiveBarWidth, params.minEffectiveWidth),
    params.maxEffectiveWidth,
  )
  const progress =
    (clampedWidth - params.minEffectiveWidth) /
    (params.maxEffectiveWidth - params.minEffectiveWidth)

  return params.minMarginX + (params.maxMarginX - params.minMarginX) * progress
}

/**
 * Scales the circular card to fit the available mobile bar width.
 *
 * @param params - Mobile scale inputs.
 * @returns A unitless card scale.
 */
export function getMobileCardScale(params: MobileCardScaleParams): number {
  if (!params.isMobile || params.effectiveBarWidth <= 0) {
    return 1
  }

  const targetWidth = params.effectiveBarWidth - params.marginX * 2

  return Math.min(1, Math.max(targetWidth, 0) / params.baseWidth)
}

/**
 * Builds the mobile card viewport inline style.
 *
 * @param isMobile - Whether the responsive context is mobile.
 * @param baseWidth - The unscaled circular card width.
 * @param scale - The mobile card scale.
 * @returns Inline style text for the viewport wrapper.
 */
export function getCardViewportStyle(
  isMobile: boolean,
  baseWidth: number,
  scale: number,
): string {
  if (!isMobile) {
    return ''
  }

  return `height:${baseWidth * scale}px`
}

/**
 * Builds the inner absolute-positioned card scale wrapper style.
 *
 * @param isMobile - Whether the responsive context is mobile.
 * @param baseWidth - The unscaled circular card width.
 * @param scale - The mobile card scale.
 * @returns Inline style text for the scale wrapper.
 */
export function getCardScaleStyle(
  isMobile: boolean,
  baseWidth: number,
  scale: number,
): string {
  if (!isMobile) {
    return ''
  }

  return [
    'position:absolute',
    'left:50%',
    'top:0',
    `width:${baseWidth}px`,
    `height:${baseWidth}px`,
    `transform:translateX(-50%) scale(${scale})`,
    'transform-origin:top center',
  ].join(';')
}

/**
 * Builds the circular card surface animation style.
 *
 * @param isExpanded - Whether the card surface is revealed.
 * @returns Inline style text for the card surface.
 */
export function getCardSurfaceStyle(isExpanded: boolean): string {
  return [
    'clip-path:circle(50%)',
    `transform:scale(${isExpanded ? 1 : 0})`,
    'transform-origin:center',
  ].join(';')
}

/**
 * Builds the dismiss button orbit position and reveal transition.
 *
 * @param params - Dismiss button geometry and expansion state.
 * @returns Inline style text for the dismiss button.
 */
export function getDismissButtonStyle(params: DismissButtonStyleParams): string {
  const radians = (params.angleDegrees * Math.PI) / 180
  const x = Math.cos(radians) * params.orbitRadius
  const y = Math.sin(radians) * params.orbitRadius
  const scale = params.isExpanded ? 1 : 0.72
  const opacity = params.isExpanded ? 1 : 0

  return [
    'left:50%',
    'top:50%',
    `transform:translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
    `opacity:${opacity}`,
    `transition-delay:${params.isExpanded ? 500 : 0}ms`,
  ].join(';')
}

/**
 * Builds the orbit image transform for its index and hover state.
 *
 * @param params - Orbit geometry and hover state.
 * @returns Inline style text for a decorative image.
 */
export function getDecorativeImageStyle(params: DecorativeImageStyleParams): string {
  const angle = -90 + (360 / Math.max(params.count, 1)) * params.index
  const radians = (angle * Math.PI) / 180
  const x = Math.cos(radians) * params.orbitRadius
  const y = Math.sin(radians) * params.orbitRadius
  const imageRotation = angle + 90
  const delay = getDecorativeImageDelay(params.index, params.count)
  const hoverOffset =
    params.activeIndex === params.index
      ? params.orbitRadius * params.hoverOffsetRatio
      : 0
  const hoverX = Math.cos(radians) * hoverOffset
  const hoverY = Math.sin(radians) * hoverOffset
  const finalX = params.isExpanded ? x + hoverX : 0
  const finalY = params.isExpanded ? y + hoverY : 0
  const scale = params.isExpanded ? 1 : 0.82

  return [
    'left:50%',
    'top:50%',
    `--decorative-image-rotation:${imageRotation}deg`,
    `transform:translate(-50%, -50%) translate(${finalX}px, ${finalY}px) scale(${scale})`,
    `transition-delay:${params.activeIndex === null ? delay : 0}ms`,
  ].join(';')
}
