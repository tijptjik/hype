// BITS
import { cssVars, cx } from '$lib/bits/utils'
// TYPES
import type {
  ButtonColor,
  ButtonCssVars,
  ButtonModifier,
  ButtonSize,
  ButtonStyle,
} from './button.types'

const BG_CLASSES = cx(
  'bg-[var(--btn-bg)]',
  'disabled:bg-[var(--btn-disabled-bg,var(--btn-bg))]',
  'disabled:opacity-30',
)

const LAYOUT_CLASSES = cx('inline-flex', 'items-center', 'justify-center', 'gap-2')

const SIZING_CLASSES = cx(
  'max-w-full',
  'h-[var(--btn-size)]',
  'max-h-full',
  'px-[var(--btn-padding-x)]',
  'active:scale-[0.98]',
)

const BORDER_CLASSES = cx(
  'rounded-xl',
  'border',
  'border-[var(--btn-border)]',
  'disabled:border-[var(--btn-disabled-border,var(--btn-border))]',
)

const TEXT_CLASSES = cx(
  'text-[var(--btn-fg)]',
  'text-[calc(var(--btn-base-label-size)+((var(--btn-size)-var(--btn-base-size))*var(--btn-label-multiplier)))]',
  'disabled:text-[var(--btn-disabled-fg,var(--btn-fg))]',
  'leading-none',
)

const SHADOW_CLASSES = cx('shadow-[var(--shadow-mini)]', 'disabled:shadow-none')

const HOVER_CLASSES = cx(
  'hover:not-disabled:hover:not-[aria-disabled=true]:border-[var(--btn-hover-border,var(--btn-border))]',
  'hover:not-disabled:hover:not-[aria-disabled=true]:bg-[var(--btn-hover-bg,var(--btn-bg))]',
  'hover:not-disabled:hover:not-[aria-disabled=true]:text-[var(--btn-hover-fg,var(--btn-fg))]',
)

const ACTIVE_CLASSES = cx(
  'active:not-disabled:active:not-[aria-disabled=true]:border-[var(--btn-active-border,var(--btn-border))]',
  'active:not-disabled:active:not-[aria-disabled=true]:bg-[var(--btn-active-bg,var(--btn-bg))]',
  'active:not-disabled:active:not-[aria-disabled=true]:text-[var(--btn-active-fg,var(--btn-fg))]',
)

const FOCUS_VISIBLE_CLASSES = cx(
  'focus-visible:not-disabled:focus-visible:not-[aria-disabled=true]:border-[var(--btn-hover-border,var(--btn-border))]',
  'focus-visible:not-disabled:focus-visible:not-[aria-disabled=true]:bg-[var(--btn-hover-bg,var(--btn-bg))]',
  'focus-visible:not-disabled:focus-visible:not-[aria-disabled=true]:text-[var(--btn-hover-fg,var(--btn-fg))]',
  'focus-visible:outline-none',
)

const ARIA_DISABLED_CLASSES = cx(
  '[&[aria-disabled=true]]:pointer-events-none',
  '[&[aria-disabled=true]]:cursor-not-allowed',
  '[&[aria-disabled=true]]:opacity-30',
  '[&[aria-disabled=true]]:shadow-none',
  '[&[aria-disabled=true]]:border-[var(--btn-disabled-border,var(--btn-border))]',
  '[&[aria-disabled=true]]:bg-[var(--btn-disabled-bg,var(--btn-bg))]',
  '[&[aria-disabled=true]]:text-[var(--btn-disabled-fg,var(--btn-fg))]',
)

const TRANSITION_CLASSES = cx(
  'transition-[background-color,border-color,color,transform,gap,padding-inline]',
  'duration-[150ms,150ms,150ms,200ms,260ms,260ms]',
  'ease-[ease,ease,ease,ease,ease,ease]',
)

const POINTER_CLASSES = cx(
  'disabled:pointer-events-none',
  'disabled:cursor-not-allowed',
)

const ROOT_BASE_CLASSES = cx(
  BG_CLASSES,
  BORDER_CLASSES,
  LAYOUT_CLASSES,
  SIZING_CLASSES,
  TEXT_CLASSES,
  SHADOW_CLASSES,
  TRANSITION_CLASSES,
  HOVER_CLASSES,
  ACTIVE_CLASSES,
  FOCUS_VISIBLE_CLASSES,
  ARIA_DISABLED_CLASSES,
  POINTER_CLASSES,
)

const BASE_BUTTON_VARS = {
  '--btn-size': '2.75rem',
  '--btn-base-size': '2.75rem',
  '--btn-base-label-size': '1rem',
  '--btn-label-multiplier': '0.2',
  '--btn-label-penalty': '0.25',
  '--btn-icon-ratio': '0.5',
  '--btn-padding-x': '1.3125rem',
  '--btn-bg': 'var(--btn-color)',
  '--btn-fg': 'var(--btn-color-content)',
  '--btn-border': 'color-mix(in oklab, var(--btn-color) 86%, black)',
  '--btn-hover-bg': 'color-mix(in oklab, var(--btn-color) 92%, black)',
  '--btn-active-bg': 'color-mix(in oklab, var(--btn-color) 84%, black)',
} as const satisfies ButtonCssVars

const COLOR_VAR_MAP = {
  neutral: {
    '--btn-color': 'var(--color-neutral)',
    '--btn-color-content': 'var(--color-neutral-content)',
    '--btn-outline-fg': 'var(--color-neutral-content)',
    '--btn-soft-fg': 'var(--color-neutral-content)',
    '--btn-transparent-fg': 'var(--color-base-content)',
    '--btn-transparent-hover-fg': 'var(--color-primary)',
    '--btn-transparent-active-fg':
      'color-mix(in oklab, var(--color-primary) 84%, white)',
  },
  light: {
    '--btn-color': 'var(--color-base-100)',
    '--btn-color-content': 'var(--color-base-content)',
    '--btn-outline-fg': 'var(--color-base-content)',
    '--btn-soft-fg': 'var(--color-base-content)',
  },
  dark: {
    '--btn-color': 'var(--color-base-content)',
    '--btn-color-content': 'var(--color-base-100)',
    '--btn-outline-fg': 'var(--color-base-content)',
    '--btn-soft-fg': 'var(--color-base-content)',
  },
  primary: {
    '--btn-color': 'var(--color-primary)',
    '--btn-color-content': 'var(--color-white)',
  },
  secondary: {
    '--btn-color': 'var(--color-secondary)',
    '--btn-color-content': 'var(--color-white)',
  },
  accent: {
    '--btn-color': 'var(--color-accent)',
    '--btn-color-content': 'var(--color-white)',
  },
  info: {
    '--btn-color': 'var(--color-info)',
    '--btn-color-content': 'var(--color-info-content)',
  },
  success: {
    '--btn-color': 'var(--color-success)',
    '--btn-color-content': 'var(--color-success-content)',
  },
  warning: {
    '--btn-color': 'var(--color-warning)',
    '--btn-color-content': 'var(--color-warning-content)',
  },
  error: {
    '--btn-color': 'var(--color-error)',
    '--btn-color-content': 'var(--color-white)',
  },
} as const satisfies Record<ButtonColor, ButtonCssVars>

const STYLE_VAR_MAP = {
  none: {},
  outline: {
    '--btn-bg': 'transparent',
    '--btn-fg': 'var(--btn-outline-fg, var(--btn-color))',
    '--btn-border': 'var(--btn-color)',
    '--btn-hover-bg': 'transparent',
    '--btn-hover-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 88%, white)',
    '--btn-active-bg': 'transparent',
    '--btn-active-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 76%, white)',
  },
  dash: {
    '--btn-bg': 'transparent',
    '--btn-fg': 'var(--btn-outline-fg, var(--btn-color))',
    '--btn-border': 'var(--btn-color)',
    '--btn-hover-bg': 'transparent',
    '--btn-hover-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 88%, white)',
    '--btn-active-bg': 'transparent',
    '--btn-active-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 76%, white)',
  },
  soft: {
    '--btn-bg': 'color-mix(in oklab, var(--btn-color) 16%, transparent)',
    '--btn-fg': 'var(--btn-soft-fg, var(--btn-color))',
    '--btn-border': 'color-mix(in oklab, var(--btn-color) 24%, transparent)',
    '--btn-hover-bg': 'color-mix(in oklab, var(--btn-color) 22%, transparent)',
    '--btn-active-bg': 'color-mix(in oklab, var(--btn-color) 28%, transparent)',
  },
  ghost: {
    '--btn-bg': 'transparent',
    '--btn-fg': 'var(--btn-outline-fg, var(--btn-color))',
    '--btn-border': 'transparent',
    '--btn-hover-bg': 'color-mix(in oklab, var(--btn-color) 12%, transparent)',
    '--btn-active-bg': 'color-mix(in oklab, var(--btn-color) 18%, transparent)',
  },
  transparent: {
    '--btn-bg': 'transparent',
    '--btn-fg': 'var(--btn-transparent-fg, var(--btn-outline-fg, var(--btn-color)))',
    '--btn-border': 'transparent',
    '--btn-hover-bg': 'transparent',
    '--btn-hover-fg': 'var(--btn-transparent-hover-fg, var(--btn-color))',
    '--btn-active-bg': 'transparent',
    '--btn-active-fg':
      'var(--btn-transparent-active-fg, color-mix(in oklab, var(--btn-color) 84%, white))',
  },
  link: {
    '--btn-bg': 'transparent',
    '--btn-fg': 'var(--btn-outline-fg, var(--btn-color))',
    '--btn-border': 'transparent',
    '--btn-hover-bg': 'transparent',
    '--btn-hover-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 88%, white)',
    '--btn-active-bg': 'transparent',
    '--btn-active-fg':
      'color-mix(in oklab, var(--btn-outline-fg, var(--btn-color)) 76%, white)',
  },
} as const satisfies Record<ButtonStyle, ButtonCssVars>

const SIZE_VAR_MAP = {
  xs: {
    '--btn-size': 'calc(var(--btn-base-size) * 0.5)',
    '--btn-padding-x': '0.75rem',
  },
  sm: {
    '--btn-size': 'calc(var(--btn-base-size) * 0.75)',
    '--btn-padding-x': '1rem',
  },
  md: {},
  lg: {
    '--btn-size': 'calc(var(--btn-base-size) * 1.25)',
    '--btn-padding-x': '1.5rem',
  },
  xl: {
    '--btn-size': 'calc(var(--btn-base-size) * 1.5)',
    '--btn-padding-x': '1.75rem',
  },
} as const satisfies Record<ButtonSize, ButtonCssVars>

const STYLE_CLASS_MAP = {
  none: '',
  outline: '',
  dash: 'border-dashed',
  soft: '',
  ghost: 'shadow-none',
  transparent: 'border-0 shadow-none',
  link: 'h-auto rounded-none border-0 px-0 underline underline-offset-4 shadow-none',
} as const satisfies Record<ButtonStyle, string>

const MODIFIER_CLASS_MAP = {
  wide: 'w-64',
  block: 'w-full',
  square: 'aspect-square w-auto min-w-0 px-0',
  circle: 'aspect-square w-auto min-w-0 rounded-full px-0',
} as const satisfies Record<ButtonModifier, string>

const GHOST_NEUTRAL_VARS = {
  '--btn-hover-fg': 'var(--color-primary)',
  '--btn-active-fg': 'color-mix(in oklab, var(--color-primary) 84%, white)',
} as const satisfies ButtonCssVars

export const BUTTON_ICON_CLASSES = cx(
  'inline-flex',
  'h-[calc(var(--btn-size)*var(--btn-icon-ratio))]',
  'w-[calc(var(--btn-size)*var(--btn-icon-ratio))]',
  'shrink-0',
  'items-center',
  'justify-center',
  'leading-none',
  'text-inherit',
  '[&_svg]:block',
  '[&_svg]:h-full',
  '[&_svg]:w-full',
  '[&_svg]:text-inherit',
)

export const BUTTON_LABEL_CLASSES = cx(
  'inline-block',
  'max-w-[20ch]',
  'overflow-hidden',
  'whitespace-nowrap',
  'text-inherit',
  'translate-x-0',
  'leading-[1.4]',
  'opacity-100',
  'transition-[max-width,opacity,margin-inline,transform]',
  'duration-260',
  'ease-[ease]',
)

export function getButtonRootClasses(args: {
  style: ButtonStyle
  modifier?: ButtonModifier
  className?: string
}): string {
  return cx(
    ROOT_BASE_CLASSES,
    STYLE_CLASS_MAP[args.style],
    args.modifier ? MODIFIER_CLASS_MAP[args.modifier] : '',
    args.className,
  )
}

export function getButtonRootVars(args: {
  color: ButtonColor
  style: ButtonStyle
  size: ButtonSize
}): string {
  return cssVars(
    BASE_BUTTON_VARS,
    COLOR_VAR_MAP[args.color],
    STYLE_VAR_MAP[args.style],
    SIZE_VAR_MAP[args.size],
    args.color === 'neutral' && args.style === 'ghost' ? GHOST_NEUTRAL_VARS : null,
  )
}
