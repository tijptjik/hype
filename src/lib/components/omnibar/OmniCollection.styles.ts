import { cx } from '$lib/bits/utils'

import {
  OMNIBAR_GLASS_BORDER_CLASSES,
  OMNIBAR_GLASS_TRAY_CLASSES,
  OMNIBAR_TRANSITION_CLASSES,
} from './omnibar.styles'

export function getOmniCollectionPanelClasses(shouldFloatMobile: boolean): string {
  return cx(
    'pointer-events-auto absolute top-0 z-50 flex w-auto select-none flex-col overflow-hidden rounded-b-[1.125rem] border-2 border-t-0 border-base-200 bg-black shadow-lg',
    OMNIBAR_TRANSITION_CLASSES,
    shouldFloatMobile
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

export const OMNI_COLLECTION_SCROLL_AREA_CLASSES = 'overflow-y-auto px-4 pb-2 pt-1.5'

export const OMNI_COLLECTION_LIST_CLASSES = 'space-y-2 overscroll-contain'

export const OMNI_COLLECTION_ITEM_CLASSES =
  'group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-white/6'

export const OMNI_COLLECTION_ITEM_TITLE_CLASSES =
  'select-none pl-2 text-[0.92rem] font-light tracking-[0.01em] text-base-content/80'

export const OMNI_COLLECTION_FOOTER_CLASSES = cx(
  'pointer-events-auto flex h-12 items-center justify-between border-t border-base-200/70 bg-black px-4',
  'w-120:border-t',
)
