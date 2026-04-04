import { cx } from '$lib/bits/utils'
import { getElevatedChromeXGutter, getOmnibarTopGutter } from './Omnibar.layout'

type OmnibarResponsiveLayout = {
  availableViewportHeight: number
  effectiveAppMainWidth: number
  hasElevatedChrome: boolean
}

function getOmnibarResponsiveFlags(effectiveAppMainWidth: number): {
  hasWideLayout: boolean
  hasMediumLayout: boolean
  hasLargeLayout: boolean
} {
  return {
    hasWideLayout: effectiveAppMainWidth >= 480,
    hasMediumLayout: effectiveAppMainWidth >= 768,
    hasLargeLayout: effectiveAppMainWidth >= 1280,
  }
}

export const OMNIBAR_TRANSITION_CLASSES =
  'transition-[margin,width,padding,height,border-color,background-color,border-radius,box-shadow] duration-260 ease-[ease]'

const OMNIBAR_COLLECTION_PANEL_TRANSITION_CLASSES =
  'transition-[margin,width,border-color,background-color,border-radius,box-shadow] duration-260 ease-[ease]'

export const OMNIBAR_GLASS_BORDER_CLASSES =
  'border-[color-mix(in_oklab,var(--color-base-content)_12%,transparent)]'

const OMNIBAR_GLASS_SURFACE_CLASSES = 'bg-black shadow-[0_18px_48px_rgb(0_0_0_/_0.34)]'

export const OMNIBAR_GLASS_TRAY_CLASSES =
  'bg-black shadow-[0_18px_48px_rgb(0_0_0_/_0.34)]'

const OMNIBAR_TRAY_INSET_CLASSES = 'mx-[1.75rem]'

const OMNIBAR_ROOT_SHARED_CLASSES =
  'relative z-50 mt-0 min-w-0 shrink-0 grow-0 select-none overscroll-auto px-0 caret-transparent'

const OMNIBAR_ROOT_NARROW_GUTTER_CLASSES = 'mt-4 mb-4 mx-4'
const OMNIBAR_ROOT_WIDE_GUTTER_CLASSES = 'mt-6 mb-6 mx-6'
const OMNIBAR_ROOT_TALL_WIDE_DESKTOP_GUTTER_CLASSES = 'mt-12 mb-6 mx-6'

export function getOmnibarRootClasses({
  availableViewportHeight,
  effectiveAppMainWidth,
  hasElevatedChrome,
}: OmnibarResponsiveLayout): string {
  const xGutterPx = getElevatedChromeXGutter(effectiveAppMainWidth)
  const topGutterPx = getOmnibarTopGutter(
    effectiveAppMainWidth,
    availableViewportHeight,
  )
  const rootGutterClasses =
    topGutterPx === 48
      ? OMNIBAR_ROOT_TALL_WIDE_DESKTOP_GUTTER_CLASSES
      : xGutterPx === 16
        ? OMNIBAR_ROOT_NARROW_GUTTER_CLASSES
        : OMNIBAR_ROOT_WIDE_GUTTER_CLASSES

  return cx(
    OMNIBAR_ROOT_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && rootGutterClasses,
  )
}

const OMNIBAR_WIDTH_CONTAINER_SHARED_CLASSES = 'min-w-0 w-full'

const OMNIBAR_WIDTH_CONTAINER_FLOATING_CLASSES = 'mx-auto max-w-[32.375rem]'

export function getOmnibarWidthContainerClasses(hasElevatedChrome: boolean): string {
  return cx(
    OMNIBAR_WIDTH_CONTAINER_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && OMNIBAR_WIDTH_CONTAINER_FLOATING_CLASSES,
  )
}

const OMNIBAR_SURFACE_SHARED_CLASSES =
  'pointer-events-auto isolate relative min-w-0 w-full overflow-hidden rounded-none bg-black'

const OMNIBAR_SURFACE_FLOATING_MOBILE_CLASSES = cx(
  'rounded-full border',
  OMNIBAR_GLASS_BORDER_CLASSES,
  OMNIBAR_GLASS_SURFACE_CLASSES,
)

export function getOmnibarSurfaceClasses({
  effectiveAppMainWidth,
  hasElevatedChrome,
}: OmnibarResponsiveLayout): string {
  const { hasWideLayout } = getOmnibarResponsiveFlags(effectiveAppMainWidth)

  return cx(
    OMNIBAR_SURFACE_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && OMNIBAR_SURFACE_FLOATING_MOBILE_CLASSES,
    hasElevatedChrome &&
      hasWideLayout && [
        'rounded-full border',
        OMNIBAR_GLASS_BORDER_CLASSES,
        OMNIBAR_GLASS_SURFACE_CLASSES,
      ],
  )
}

const OMNIBAR_BAR_SHARED_CLASSES = 'relative z-30 flex w-full items-center bg-black'

const OMNIBAR_BAR_NONFLOATING_MOBILE_CLASSES = cx(
  'border-b',
  OMNIBAR_GLASS_BORDER_CLASSES,
)
const OMNIBAR_BAR_FLOATING_MOBILE_CLASSES = 'min-h-14'

function getOmnibarBarClasses({
  effectiveAppMainWidth,
  hasElevatedChrome,
}: OmnibarResponsiveLayout): string {
  const { hasWideLayout } = getOmnibarResponsiveFlags(effectiveAppMainWidth)

  return cx(
    OMNIBAR_BAR_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    !hasElevatedChrome && OMNIBAR_BAR_NONFLOATING_MOBILE_CLASSES,
    hasElevatedChrome && OMNIBAR_BAR_FLOATING_MOBILE_CLASSES,
    hasElevatedChrome && hasWideLayout && 'min-h-14',
  )
}

export function getOmnibarNavBarClasses(layout: OmnibarResponsiveLayout): string {
  return cx(getOmnibarBarClasses(layout), 'min-h-14')
}

export function getOmnibarSearchBarClasses(layout: OmnibarResponsiveLayout): string {
  return cx(getOmnibarBarClasses(layout), 'min-h-14 justify-between')
}

const OMNIBAR_RESULTS_SHARED_CLASSES =
  'pointer-events-auto isolate mt-0 flex min-h-0 flex-col overflow-hidden rounded-b-[1.75rem] border border-t-0 border-base-300 bg-black bg-clip-padding'

const OMNIBAR_RESULTS_DEFAULT_MOBILE_CLASSES = 'mx-0 rounded-b-none border-x-0'

const OMNIBAR_RESULTS_FLOATING_MOBILE_CLASSES = cx(
  `${OMNIBAR_TRAY_INSET_CLASSES} border border-t-0`,
  OMNIBAR_GLASS_BORDER_CLASSES,
  OMNIBAR_GLASS_TRAY_CLASSES,
)

export function getOmnibarResultsClasses({
  effectiveAppMainWidth,
  hasElevatedChrome,
}: OmnibarResponsiveLayout): string {
  const { hasWideLayout } = getOmnibarResponsiveFlags(effectiveAppMainWidth)

  return cx(
    OMNIBAR_RESULTS_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome
      ? OMNIBAR_RESULTS_FLOATING_MOBILE_CLASSES
      : OMNIBAR_RESULTS_DEFAULT_MOBILE_CLASSES,
    hasElevatedChrome &&
      hasWideLayout && [
        'mx-[1.75rem] rounded-[0_0_1.75rem_1.75rem] border border-t-0',
        OMNIBAR_GLASS_BORDER_CLASSES,
        OMNIBAR_GLASS_TRAY_CLASSES,
      ],
  )
}

export function getOmnibarCollectionPanelClasses({
  effectiveAppMainWidth,
  hasElevatedChrome,
}: OmnibarResponsiveLayout): string {
  const { hasWideLayout } = getOmnibarResponsiveFlags(effectiveAppMainWidth)

  return cx(
    'pointer-events-auto isolate mt-0 flex w-auto select-none flex-col overflow-hidden rounded-b-[1.75rem] border border-t-0 border-base-300 bg-black bg-clip-padding',
    OMNIBAR_COLLECTION_PANEL_TRANSITION_CLASSES,
    hasElevatedChrome
      ? [
          `${OMNIBAR_TRAY_INSET_CLASSES} border border-t-0`,
          OMNIBAR_GLASS_BORDER_CLASSES,
          OMNIBAR_GLASS_TRAY_CLASSES,
        ]
      : 'mx-0 rounded-b-none border-x-0',
    hasElevatedChrome && hasWideLayout && 'mx-[1.75rem] border border-t-0',
    OMNIBAR_GLASS_BORDER_CLASSES,
    OMNIBAR_GLASS_TRAY_CLASSES,
  )
}

export const OMNIBAR_COLLECTION_SCROLL_AREA_CLASSES = 'overflow-y-auto px-4 pb-2 pt-1.5'

export const OMNIBAR_COLLECTION_LIST_CLASSES = 'space-y-2 overscroll-contain'

export const OMNIBAR_COLLECTION_ITEM_CLASSES =
  'group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-white/6'

export const OMNIBAR_COLLECTION_ITEM_TITLE_CLASSES =
  'select-none pl-2 text-[0.92rem] font-light tracking-[0.01em] text-base-content/80'

export const OMNIBAR_COLLECTION_FOOTER_CLASSES = cx(
  'pointer-events-auto flex h-12 items-center justify-between border-t border-base-200/70 bg-black px-4',
)
