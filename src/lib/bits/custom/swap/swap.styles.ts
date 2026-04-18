// BITS
import { cssVars, cx } from '$lib/bits/utils'
// TYPES
import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'
import type { SwapVariant } from './swap.types'

type SwapCssVars = {
  '--swap-size': string
  '--swap-icon-size': string
  '--swap-color-active': string
  '--swap-color-active-hover': string
  '--swap-color-active-disabled': string
}

const LAYOUT_CLASSES = cx(
  'inline-flex',
  'h-[var(--swap-size)]',
  'w-[var(--swap-size)]',
  'min-h-[var(--swap-size)]',
  'min-w-[var(--swap-size)]',
  'items-center',
  'justify-center',
)

const SURFACE_CLASSES = cx(
  'rounded-full',
  'border',
  'border-[color:color-mix(in_oklab,var(--swap-color-active)_30%,transparent)]',
  'bg-[color:color-mix(in_oklab,var(--swap-color-active)_12%,rgb(17_17_17_/_0.72))]',
  'text-[var(--swap-color-active)]',
  'shadow-[var(--shadow-mini)]',
)

const TRANSITION_CLASSES = cx(
  'transition-[border-color,background-color,color,box-shadow]',
  'duration-180',
  'ease-out',
)

const INTERACTION_CLASSES = cx(
  'enabled:data-[hover-suppressed=false]:hover:border-[color:color-mix(in_oklab,var(--swap-color-active-hover)_34%,transparent)]',
  'enabled:data-[hover-suppressed=false]:hover:bg-[color:color-mix(in_oklab,var(--swap-color-active-hover)_16%,rgb(17_17_17_/_0.82))]',
  'enabled:data-[hover-suppressed=false]:hover:text-[var(--swap-color-active-hover)]',
  'focus-visible:border-[color:color-mix(in_oklab,var(--swap-color-active)_48%,transparent)]',
  'focus-visible:outline-none',
)

const DISABLED_CLASSES = cx(
  'disabled:cursor-not-allowed',
  'disabled:border-[color:color-mix(in_oklab,var(--swap-color-active-disabled)_26%,transparent)]',
  'disabled:bg-[color:color-mix(in_oklab,var(--swap-color-active-disabled)_12%,rgb(17_17_17_/_0.56))]',
  'disabled:text-[var(--swap-color-active-disabled)]',
  'disabled:shadow-none',
)

const ROOT_BASE_CLASSES = cx(
  LAYOUT_CLASSES,
  SURFACE_CLASSES,
  TRANSITION_CLASSES,
  INTERACTION_CLASSES,
  DISABLED_CLASSES,
)

const VARIANT_CLASS_MAP = {
  default: '',
  transparent: cx(
    'border-none',
    'bg-transparent',
    'shadow-none',
    'enabled:data-[hover-suppressed=false]:hover:border-none',
    'enabled:data-[hover-suppressed=false]:hover:bg-transparent',
    'focus-visible:border-none',
    'disabled:border-none',
    'disabled:bg-transparent',
  ),
} as const satisfies Record<SwapVariant, string>

export const SWAP_ICON_STACK_CLASSES = cx(
  'relative',
  'inline-grid',
  'h-[var(--swap-icon-size)]',
  'w-[var(--swap-icon-size)]',
  'place-items-center',
)

export const SWAP_ICON_LAYER_CLASSES = cx(
  'col-start-1',
  'row-start-1',
  'inline-flex',
  'h-full',
  'w-full',
  'items-center',
  'justify-center',
  'text-current',
  'transition-[opacity,transform,color]',
  'duration-[180ms]',
  'ease-out',
  '[&_svg]:block',
  '[&_svg]:h-[var(--swap-icon-size)]',
  '[&_svg]:w-[var(--swap-icon-size)]',
  '[&_svg]:shrink-0',
)

const SIZE_VAR_MAP = {
  xs: {
    '--swap-size': '2rem',
    '--swap-icon-size': '1rem',
  },
  sm: {
    '--swap-size': '2.75rem',
    '--swap-icon-size': '1.5rem',
  },
  md: {
    '--swap-size': '3.5rem',
    '--swap-icon-size': '1.5rem',
  },
  lg: {
    '--swap-size': '4.55rem',
    '--swap-icon-size': '1.75rem',
  },
  xl: {
    '--swap-size': '5.5rem',
    '--swap-icon-size': '2rem',
  },
} as const satisfies Record<
  ButtonSize,
  Pick<SwapCssVars, '--swap-size' | '--swap-icon-size'>
>

function resolveSwapColorToken(color: ButtonColor): string {
  if (color === 'neutral') return 'var(--color-glass-base)'
  if (color === 'light') return 'var(--color-base-100)'
  if (color === 'dark') return 'var(--color-base-content)'
  return `var(--color-${color})`
}

function resolveSwapHoverColorToken(color: ButtonColor): string {
  return `color-mix(in oklab, ${resolveSwapColorToken(color)} 80%, black)`
}

function resolveSwapDisabledColorToken(color: ButtonColor): string {
  return `color-mix(in oklab, ${resolveSwapColorToken(color)} 80%, var(--color-base-300))`
}

export function getSwapRootClasses(args: {
  variant: SwapVariant
  className?: string
}): string {
  return cx(ROOT_BASE_CLASSES, VARIANT_CLASS_MAP[args.variant], args.className)
}

export function getSwapRootVars(args: {
  checked: boolean
  size: ButtonSize
  onColor: ButtonColor
  offColor: ButtonColor
}): string {
  return cssVars(SIZE_VAR_MAP[args.size], {
    '--swap-color-active': args.checked
      ? resolveSwapColorToken(args.onColor)
      : resolveSwapColorToken(args.offColor),
    '--swap-color-active-hover': args.checked
      ? resolveSwapHoverColorToken(args.offColor)
      : resolveSwapHoverColorToken(args.onColor),
    '--swap-color-active-disabled': args.checked
      ? resolveSwapDisabledColorToken(args.onColor)
      : resolveSwapDisabledColorToken(args.offColor),
  })
}
