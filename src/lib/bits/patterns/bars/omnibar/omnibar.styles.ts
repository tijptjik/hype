import { cx } from '$lib/bits/utils'

export const OMNIBAR_TRANSITION_CLASSES =
  'transition-[padding,height,border-color,background-color,border-radius,box-shadow] duration-260 ease-[ease]'

export const OMNIBAR_GLASS_BORDER_CLASSES =
  'border-[color-mix(in_oklab,var(--color-base-content)_12%,transparent)]'

const OMNIBAR_GLASS_SURFACE_CLASSES =
  'bg-[color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] shadow-[0_18px_48px_rgb(0_0_0_/_0.34)] backdrop-blur-[14px]'

export const OMNIBAR_GLASS_TRAY_CLASSES =
  'bg-[color-mix(in_oklab,black_88%,var(--color-glass-result)_12%)] shadow-[0_18px_48px_rgb(0_0_0_/_0.28)] backdrop-blur-[14px]'

const OMNIBAR_ROOT_SHARED_CLASSES =
  'relative z-50 mt-0 shrink-0 grow-0 select-none overscroll-auto px-0 caret-transparent'

const OMNIBAR_ROOT_FLOATING_MOBILE_CLASSES = 'mx-6 mt-6'

const OMNIBAR_ROOT_DESKTOP_CLASSES =
  'w-120:mt-4 w-120:mx-4 w-192:mt-6 w-192:px-4 w-320:mt-10 w-320:px-9'

export function getOmnibarRootClasses(hasElevatedChrome: boolean): string {
  return cx(
    OMNIBAR_ROOT_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && OMNIBAR_ROOT_FLOATING_MOBILE_CLASSES,
    OMNIBAR_ROOT_DESKTOP_CLASSES,
  )
}

export const OMNIBAR_WIDTH_CONTAINER_CLASSES = 'mx-auto max-w-120'

const OMNIBAR_SURFACE_SHARED_CLASSES =
  'grid grid-cols-1 grid-rows-1 overflow-visible rounded-none border-base-300 bg-black'

const OMNIBAR_SURFACE_FLOATING_MOBILE_CLASSES = cx(
  'rounded-[1.125rem] border',
  OMNIBAR_GLASS_BORDER_CLASSES,
  OMNIBAR_GLASS_SURFACE_CLASSES,
)

const OMNIBAR_SURFACE_DESKTOP_CLASSES = `w-120:rounded-[1.125rem] w-120:border ${OMNIBAR_GLASS_BORDER_CLASSES} ${OMNIBAR_GLASS_SURFACE_CLASSES}`

export function getOmnibarSurfaceClasses(hasElevatedChrome: boolean): string {
  return cx(
    OMNIBAR_SURFACE_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && OMNIBAR_SURFACE_FLOATING_MOBILE_CLASSES,
    OMNIBAR_SURFACE_DESKTOP_CLASSES,
  )
}

const OMNIBAR_BAR_SHARED_CLASSES =
  'pointer-events-auto relative z-30 col-start-1 row-start-1 flex w-full items-center bg-black'

const OMNIBAR_BAR_DESKTOP_CLASSES =
  'w-120:min-h-14 w-120:rounded-[inherit] w-120:border-0 w-120:bg-transparent w-192:min-h-12'

const OMNIBAR_BAR_FLOATING_MOBILE_CLASSES =
  'min-h-14 rounded-[inherit] border-0 bg-transparent'

function getOmnibarBarClasses(hasElevatedChrome: boolean): string {
  return cx(
    OMNIBAR_BAR_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome && OMNIBAR_BAR_FLOATING_MOBILE_CLASSES,
    OMNIBAR_BAR_DESKTOP_CLASSES,
  )
}

export function getOmnibarNavBarClasses(hasElevatedChrome: boolean): string {
  return cx(
    getOmnibarBarClasses(hasElevatedChrome),
    'min-h-16 border-b-2 border-base-300',
    hasElevatedChrome && 'border-b-0',
    'w-120:border-b-0',
  )
}

export function getOmnibarSearchBarClasses(hasElevatedChrome: boolean): string {
  return cx(
    getOmnibarBarClasses(hasElevatedChrome),
    'min-h-16 justify-between border-b-2 border-base-300',
    hasElevatedChrome && 'border-b-0',
    'w-120:border-b-0',
  )
}

const OMNIBAR_RESULTS_SHARED_CLASSES =
  'pointer-events-auto mt-0 flex min-h-0 flex-col overflow-hidden rounded-b-[1.125rem] border-2 border-t-0 border-base-200 bg-black shadow-lg'

const OMNIBAR_RESULTS_DEFAULT_MOBILE_CLASSES = 'mx-3'

const OMNIBAR_RESULTS_FLOATING_MOBILE_CLASSES = cx(
  'mx-0 border border-t-0',
  OMNIBAR_GLASS_BORDER_CLASSES,
  OMNIBAR_GLASS_TRAY_CLASSES,
)

const OMNIBAR_RESULTS_DESKTOP_CLASSES = `w-120:mx-0 w-120:rounded-[0_0_1.125rem_1.125rem] w-120:border w-120:border-t-0 ${OMNIBAR_GLASS_BORDER_CLASSES} ${OMNIBAR_GLASS_TRAY_CLASSES}`

export function getOmnibarResultsClasses(hasElevatedChrome: boolean): string {
  return cx(
    OMNIBAR_RESULTS_SHARED_CLASSES,
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome
      ? OMNIBAR_RESULTS_FLOATING_MOBILE_CLASSES
      : OMNIBAR_RESULTS_DEFAULT_MOBILE_CLASSES,
    OMNIBAR_RESULTS_DESKTOP_CLASSES,
  )
}

export function getOmnibarCollectionPanelClasses(hasElevatedChrome: boolean): string {
  return cx(
    'pointer-events-auto absolute top-0 z-50 flex w-auto select-none flex-col overflow-hidden rounded-b-[1.125rem] border-2 border-t-0 border-base-200 bg-black shadow-lg',
    OMNIBAR_TRANSITION_CLASSES,
    hasElevatedChrome
      ? [
          'left-0 right-0 border border-t-0',
          OMNIBAR_GLASS_BORDER_CLASSES,
          OMNIBAR_GLASS_TRAY_CLASSES,
        ]
      : 'left-3 right-3',
    'w-120:left-0 w-120:right-0 w-120:border w-120:border-t-0',
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
  'w-120:border-t',
)
