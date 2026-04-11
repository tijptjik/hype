// BITS
import { cx } from '$lib/bits/utils'

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
  'rounded-full',
  'border',
  'border-white/10',
  'bg-black',
  'p-2',
  'shadow-[0_10px_30px_rgba(0,0,0,0.25)]',
)

export const VIEWER_CONTROLS_BUTTON_CLASSES = cx(
  '[--btn-transparent-active-fg:var(--color-white)]',
  '[--btn-transparent-fg:var(--color-white)]',
  '[--btn-transparent-hover-fg:var(--color-white)]',
  'bg-black/70',
  'hover:bg-black/85',
  TRANSITION_CLASSES,
)

export const VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES = cx(
  'cursor-not-allowed',
  'opacity-45',
  TRANSITION_CLASSES,
)

export const VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES = TRANSITION_CLASSES

export const VIEWER_CONTROLS_EDIT_GROUP_CLASSES = cx('flex', 'items-center', 'gap-2')

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
      : 'text-white',
  )
}

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

export const VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES = cx(
  '[--btn-transparent-active-fg:var(--color-white)]',
  '[--btn-transparent-fg:var(--color-white)]',
  '[--btn-transparent-hover-fg:var(--color-white)]',
  TRANSITION_CLASSES,
)
