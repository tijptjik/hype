// BITS
import { cx } from '#lib/bits/utils.js'
import { IMAGE_CHROME_SURFACE_CLASSES } from '../imageChrome.styles'

const TRANSITION_CLASSES = cx(
  'transition-[background-color,color,opacity,transform]',
  'duration-200',
  'ease-out',
)

export const VIEWER_CONTROLS_ROOT_CLASSES = cx(
  'absolute',
  'left-1/2',
  'flex',
  '-translate-x-1/2',
  'items-center',
  'gap-2',
  'p-2',
  IMAGE_CHROME_SURFACE_CLASSES,
)

export const VIEWER_CONTROLS_BUTTON_CLASSES = cx(
  'bg-transparent',
  'hover:bg-surface',
  TRANSITION_CLASSES,
)

export const VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES = cx(
  'cursor-not-allowed',
  'opacity-45',
  TRANSITION_CLASSES,
)

export const VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES = TRANSITION_CLASSES

export const VIEWER_CONTROLS_EDIT_GROUP_CLASSES = cx('flex', 'items-center', 'gap-2')

/**
 * Style the edit toggle for its current availability and expansion state.
 * @param args - Edit control state.
 * @returns Theme-aware button classes.
 */
export function viewerControlsEditButtonClass(args: {
  isEditExpanded: boolean
  disabled: boolean
  isEditBusy: boolean
  canRotate: boolean
}): string {
  return cx(
    VIEWER_CONTROLS_BUTTON_CLASSES,
    args.isEditExpanded && !args.disabled && !args.isEditBusy && args.canRotate
      ? 'text-primary'
      : 'text-base-content',
  )
}

/**
 * Reveal rotation actions when editing is expanded and rotation is available.
 * @param args - Expansion and rotation availability.
 * @returns Rotation action container classes.
 */
export function viewerControlsEditActionsClass(args: {
  isEditExpanded: boolean
  canRotate: boolean
}): string {
  return cx(
    'flex items-center gap-2 overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out',
    args.isEditExpanded && args.canRotate
      ? 'max-w-28 translate-x-0 opacity-100'
      : 'max-w-0 translate-x-2 opacity-0',
  )
}

export const VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES = TRANSITION_CLASSES
