import { cx } from '$lib/bits/utils'

type SurfaceFit = 'fit' | 'cover'

type SurfaceVisualState = {
  fit: SurfaceFit
  isBlurred: boolean
  isGreyscale: boolean
}

type ForegroundLayerState = SurfaceVisualState & {
  animateRotation: boolean
  isHidden?: boolean
}

type RotationOverlayState = SurfaceVisualState & {
  isFadingOut: boolean
}

type IncomingLayerState = SurfaceVisualState & {
  animateRotation: boolean
  isVisible: boolean
}

export function surfaceRootClass(rounded: string, className: string): string {
  return cx(
    'relative h-full w-full overflow-hidden bg-neutral-950/5',
    rounded,
    className,
  )
}

export function backdropImageClass(): string {
  return 'absolute inset-0 h-full w-full scale-[1.04] object-cover opacity-30 blur-lg'
}

export function incomingBackdropClass(isVisible: boolean): string {
  return cx(
    'absolute inset-0 h-full w-full scale-[1.04] object-cover blur-lg transition-opacity duration-[520ms] ease-out',
    isVisible ? 'opacity-30' : 'opacity-0',
  )
}

export function imageStackClass(): string {
  return 'relative h-full w-full overflow-hidden'
}

type LoadingBreathLayerState = SurfaceVisualState & {
  isVisible: boolean
}

export function loadingBreathLayerClass({
  fit,
  isBlurred,
  isGreyscale,
  isVisible,
}: LoadingBreathLayerState): string {
  return cx(
    'pointer-events-none absolute inset-0 h-full w-full blur-md transition-[opacity,transform] duration-[1450ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
    fit === 'cover' ? 'object-cover' : 'object-contain',
    isBlurred && 'blur-lg',
    isGreyscale && 'grayscale',
    isVisible ? 'gallery-image-breathe opacity-100' : 'opacity-0',
  )
}

export function foregroundLayerClass({
  fit,
  isBlurred,
  isGreyscale,
  animateRotation,
  isHidden = false,
}: ForegroundLayerState): string {
  return cx(
    'absolute inset-0 h-full w-full',
    fit === 'cover' ? 'object-cover' : 'object-contain',
    isBlurred && 'blur-md',
    isGreyscale && 'grayscale',
    animateRotation && 'transition-transform duration-[240ms] ease-out',
    isHidden ? 'opacity-0' : 'opacity-100',
  )
}

export function rotationOverlayClass({
  fit,
  isBlurred,
  isGreyscale,
  isFadingOut,
}: RotationOverlayState): string {
  return cx(
    'absolute inset-0 h-full w-full transition-[transform,opacity] duration-[240ms] ease-out',
    fit === 'cover' ? 'object-cover' : 'object-contain',
    isBlurred && 'blur-md',
    isGreyscale && 'grayscale',
    isFadingOut ? 'opacity-0' : 'opacity-100',
  )
}

export function incomingLayerClass({
  fit,
  isBlurred,
  isGreyscale,
  animateRotation,
  isVisible,
}: IncomingLayerState): string {
  return cx(
    'absolute inset-0 h-full w-full transition-opacity duration-[520ms] ease-out',
    fit === 'cover' ? 'object-cover' : 'object-contain',
    isBlurred && 'blur-md',
    isGreyscale && 'grayscale',
    animateRotation && 'transition-transform duration-[240ms] ease-out',
    isVisible ? 'opacity-100' : 'opacity-0',
  )
}

export function preloadImageClass(): string {
  return 'pointer-events-none absolute h-0 w-0 opacity-0'
}

export function errorOverlayClass(): string {
  return 'absolute inset-0 bg-black/40'
}
