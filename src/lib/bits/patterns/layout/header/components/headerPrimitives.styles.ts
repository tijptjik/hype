// BITS
import { cx } from '$lib/bits/utils'

export const HEADER_BUTTON_LABEL_CLASSES = 'whitespace-nowrap'

export const HEADER_FORM_ACTIONS_CLASSES = 'ml-2 flex items-center gap-0'

export const HEADER_VIEW_ACTIONS_CLASSES = 'flex ml-2 items-center gap-0'

export const HEADER_FACETS_WRAP_CLASSES = 'flex items-center gap-2'

export const HEADER_FACETS_LIST_CLASSES =
  'flex h-11 items-stretch gap-1 overflow-clip rounded-full bg-base-300'

export const HEADER_FACETS_LIST_STYLE = ''

export const HEADER_FACET_ITEM_CLASSES = ''

export const HEADER_NEW_BUTTON_CLASSES = 'px-3.5'

export const HEADER_SEARCH_CLEAR_CLASSES =
  'absolute right-0 inline-flex h-full w-12 items-center justify-center rounded-full border-0 bg-transparent p-0 text-inherit'

export const HEADER_AVATAR_BUTTON_CLASSES =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-full p-0.5 text-xl'

export const HEADER_TITLE_MENU_TRIGGER_CLASSES =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent'

export const HEADER_TITLE_MENU_TRIGGER_PLACEHOLDER_CLASSES =
  'pointer-events-none opacity-0'

export const HEADER_TITLE_MENU_TRIGGER_ICON_CLASSES = 'h-[1.15rem] w-[1.15rem]'

export const HEADER_TITLE_MENU_SLOT_CLASSES = 'h-8 w-8 shrink-0'

export const HEADER_TITLE_MENU_CONTENT_CLASSES =
  'z-50 min-w-44 rounded-lg border border-[color:color-mix(in_oklab,white_16%,transparent)] bg-black p-1 shadow-none'

export const HEADER_TITLE_MENU_ITEM_CLASSES =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-[color:color-mix(in_oklab,var(--color-base-content)_92%,white_8%)] transition-colors duration-150 ease-[ease] hover:bg-[color:color-mix(in_oklab,var(--color-base-300)_88%,transparent)] data-[highlighted]:bg-[color:color-mix(in_oklab,var(--color-base-300)_88%,transparent)]'

export const HEADER_PUBLISH_STATUS_CLASSES =
  'inline-flex h-10 items-center gap-2 px-3 text-sm font-medium text-base-content'

export const HEADER_PUBLISH_STATUS_LABEL_CLASSES = 'whitespace-nowrap'

const HEADER_FORM_ACTION_MAIN_CLASSES = 'w-32.5 justify-center'

const HEADER_FORM_ACTION_PUBLISH_CLASSES =
  'w-37.75 justify-center [--btn-padding-x:0.5rem]'

const HEADER_HIDE_LABEL_ACTION_CLASSES =
  '!w-[var(--btn-size)] shrink-0 px-0 [--btn-padding-x:0] [&>span:first-child]:mx-0'

const HEADER_AVATAR_SHELL_BASE_CLASSES = 'h-10 flex-none overflow-clip'

const HEADER_AVATAR_SHELL_VISIBLE_CLASSES =
  'w-10 transition-[width] duration-260 delay-350 ease-[ease]'

const HEADER_AVATAR_SHELL_HIDDEN_CLASSES =
  'w-0 transition-[width] duration-260 delay-20 ease-[ease]'

const HEADER_FACET_BUTTON_BASE_CLASSES = 'h-full rounded-full px-4'
const HEADER_FACET_BUTTON_HIDE_LABEL_CLASSES = 'shrink-0 [&>span:first-child]:mx-0'
const HEADER_FACET_BUTTON_ACTIVE_VARS = cx(
  '[--btn-hover-bg:var(--color-accent-soft-hover-bg)]',
  '[--btn-active-bg:var(--color-accent-soft-active-bg)]',
  '[--btn-active-fg:var(--color-accent-soft-active-fg)]',
)

const HEADER_FACET_BUTTON_NEUTRAL_VARS = cx(
  '[--btn-hover-bg:var(--color-accent-ghost-hover-bg)]',
  '[--btn-hover-fg:var(--color-accent-ghost-hover-fg)]',
  '[--btn-active-bg:var(--color-accent-ghost-active-bg)]',
  '[--btn-active-fg:var(--color-accent-ghost-active-fg)]',
)

const HEADER_FACET_BUTTON_ISSUE_VARS = cx(
  '[--btn-bg:var(--color-danger-solid-bg)]',
  '[--btn-fg:var(--color-danger-solid-fg)]',
  '[--btn-border:var(--color-danger-solid-border)]',
  '[--btn-hover-bg:var(--color-danger-solid-hover-bg)]',
  '[--btn-hover-fg:var(--color-danger-solid-fg)]',
  '[--btn-active-bg:var(--color-danger-solid-active-bg)]',
  '[--btn-active-fg:var(--color-danger-solid-fg)]',
)

const HEADER_FACET_BUTTON_ISSUE_VISUAL_CLASSES = cx(
  'bg-[var(--color-danger-solid-bg)]',
  'text-[var(--color-danger-solid-fg)]',
  'border-[color:var(--color-danger-solid-rest-border)]',
  'hover:bg-[var(--color-danger-solid-hover-bg)]',
  'hover:text-[var(--color-danger-solid-fg)]',
  'hover:border-[color:var(--color-danger-solid-hover-border)]',
  'focus-visible:bg-[var(--color-danger-solid-hover-bg)]',
  'focus-visible:text-[var(--color-danger-solid-fg)]',
  'focus-visible:border-[color:var(--color-danger-solid-hover-border)]',
  'active:bg-[var(--color-danger-solid-active-bg)]',
  'active:text-[var(--color-danger-solid-fg)]',
  'active:border-[color:var(--color-danger-solid-active-border)]',
)

function resolveHeaderActionVariantClasses(className?: string): string {
  if (!className) return ''
  if (className.includes('bits-pattern-header__form-action-main')) {
    return HEADER_FORM_ACTION_MAIN_CLASSES
  }
  if (className.includes('bits-pattern-header__form-action-publish')) {
    return HEADER_FORM_ACTION_PUBLISH_CLASSES
  }
  return className
}

export function getHeaderActionClasses(className?: string, hideLabel = false): string {
  return cx(
    resolveHeaderActionVariantClasses(className),
    hideLabel && HEADER_HIDE_LABEL_ACTION_CLASSES,
  )
}

export function getHeaderAvatarShellClasses(isVisible: boolean): string {
  return cx(
    HEADER_AVATAR_SHELL_BASE_CLASSES,
    isVisible
      ? HEADER_AVATAR_SHELL_VISIBLE_CLASSES
      : HEADER_AVATAR_SHELL_HIDDEN_CLASSES,
  )
}

export function getHeaderFacetButtonClasses(args: {
  isActive: boolean
  hasIssues: boolean
  color: 'primary' | 'neutral' | 'error'
  hideLabel?: boolean
  className?: string
}): string {
  return cx(
    HEADER_FACET_BUTTON_BASE_CLASSES,
    args.hideLabel && HEADER_FACET_BUTTON_HIDE_LABEL_CLASSES,
    args.isActive && !args.hasIssues && HEADER_FACET_BUTTON_ACTIVE_VARS,
    args.color === 'neutral' &&
      !args.isActive &&
      !args.hasIssues &&
      HEADER_FACET_BUTTON_NEUTRAL_VARS,
    args.hasIssues && HEADER_FACET_BUTTON_ISSUE_VARS,
    args.hasIssues && HEADER_FACET_BUTTON_ISSUE_VISUAL_CLASSES,
    args.className,
  )
}
