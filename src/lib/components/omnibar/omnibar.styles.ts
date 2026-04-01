import { cx } from '$lib/bits/utils'

const OMNIBAR_ROOT_SHARED_CLASSES =
  'relative z-40 mt-0 shrink-0 grow-0 select-none overscroll-auto px-0 caret-transparent duration-300'

const OMNIBAR_ROOT_DESKTOP_CLASSES =
  'w-120:mt-2 w-192:mt-6 w-192:px-4 w-320:mt-10 w-320:px-9'

export const OMNIBAR_ROOT_CLASSES = cx(
  OMNIBAR_ROOT_SHARED_CLASSES,
  OMNIBAR_ROOT_DESKTOP_CLASSES,
)

const OMNIBAR_WIDTH_CLASSES = 'mx-auto max-w-120'

export const OMNIBAR_WIDTH_CONTAINER_CLASSES = cx(OMNIBAR_WIDTH_CLASSES)

const OMNIBAR_SURFACE_SHARED_CLASSES =
  'grid grid-cols-1 grid-rows-1 overflow-hidden rounded-none border-base-300 bg-black transition-[height,border-color,background-color,border-radius,box-shadow] duration-300 ease-[ease]'

const OMNIBAR_SURFACE_DESKTOP_CLASSES =
  'w-120:rounded-lg w-120:border w-120:bg-[color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] w-120:shadow-[0_18px_48px_rgb(0_0_0_/_0.34)] w-120:backdrop-blur-[14px]'

export const OMNIBAR_SURFACE_CLASSES = cx(
  OMNIBAR_SURFACE_SHARED_CLASSES,
  OMNIBAR_SURFACE_DESKTOP_CLASSES,
)

const OMNIBAR_BAR_SHARED_CLASSES =
  'pointer-events-auto relative z-30 col-start-1 row-start-1 flex w-full items-center bg-black transition-[height,border-color,background-color,border-radius] duration-300 ease-[ease]'

const OMNIBAR_BAR_DESKTOP_CLASSES =
  'w-120:min-h-14 w-120:rounded-[inherit] w-120:border-0 w-120:bg-transparent w-192:min-h-12'

export const OMNIBAR_BAR_CLASSES = cx(
  OMNIBAR_BAR_SHARED_CLASSES,
  OMNIBAR_BAR_DESKTOP_CLASSES,
)

export const OMNIBAR_NAV_BAR_CLASSES = cx(
  OMNIBAR_BAR_CLASSES,
  'min-h-16 border-b-2 border-base-300',
  'w-120:border-b-0',
)

export const OMNIBAR_SEARCH_BAR_CLASSES = cx(
  OMNIBAR_BAR_CLASSES,
  'min-h-16 justify-between border-b-2 border-base-300',
  'w-120:border-b-0',
)

const OMNIBAR_RESULTS_SHARED_CLASSES =
  'mx-3 mt-0 overflow-hidden rounded-b-xl border-2 border-t-0 border-base-200 bg-black shadow-lg'

const OMNIBAR_RESULTS_DESKTOP_CLASSES =
  'w-120:mx-0 w-120:rounded-[0_0_1rem_1rem] w-120:border w-120:border-t-0 w-120:border-[color-mix(in_oklab,var(--color-base-content)_12%,transparent)] w-120:bg-[color-mix(in_oklab,black_88%,var(--color-glass-result)_12%)] w-120:shadow-[0_18px_48px_rgb(0_0_0_/_0.28)] w-120:backdrop-blur-[14px]'

export const OMNIBAR_RESULTS_CLASSES = cx(
  OMNIBAR_RESULTS_SHARED_CLASSES,
  OMNIBAR_RESULTS_DESKTOP_CLASSES,
)
