// BITS
import { cx } from '#lib/bits/utils.js'

export const VIEWER_NAV_ROOT_CLASSES = cx(
  'pointer-events-none',
  'absolute',
  'inset-0',
  'z-20',
  'opacity-0',
  'transition-opacity',
  'duration-150',
  'group-hover/viewer:opacity-100',
  'group-focus-within/viewer:opacity-100',
)

const VIEWER_NAV_EDGE_BASE_CLASSES = cx(
  'absolute',
  'inset-y-0',
  'flex',
  'items-center',
  'p-3',
)

/**
 * Position navigation at the requested viewer edge.
 * @param side - Edge containing the navigation button.
 * @returns Navigation container classes.
 */
export function viewerNavEdgeClass(side: 'left' | 'right'): string {
  return cx(VIEWER_NAV_EDGE_BASE_CLASSES, side === 'left' ? 'left-0' : 'right-0')
}

export const VIEWER_NAV_BUTTON_CLASSES = cx(
  'pointer-events-auto',
  'inline-flex',
  'h-10',
  'w-10',
  'items-center',
  'justify-center',
  'rounded-full',
  'bg-base-100',
  'text-base-content',
  'transition',
  'hover:bg-surface',
  'disabled:cursor-default',
  'disabled:opacity-25',
)

export const VIEWER_NAV_ICON_CLASSES = cx('h-5', 'w-5')
