import { cx } from '$lib/bits/utils'
import { cssVars } from '$lib/bits/utils'

export const APP_MENU_NAV_PANEL_CLASSES = cx(
  'relative flex w-full items-center justify-between',
  'transition-[padding] duration-260 ease-[ease]',
  'md:pointer-events-auto md:inline-flex md:w-auto md:max-w-full md:items-center md:justify-center md:gap-1 md:rounded-full md:border md:border-[color-mix(in_oklab,var(--color-base-content)_12%,transparent)] md:bg-[color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] md:px-1.5 md:py-1.25 md:shadow-[0_18px_48px_rgb(0_0_0_/_0.34)] md:backdrop-blur-[14px]',
)

export const APP_MENU_ITEM_GRID_CLASSES = cx(
  'mx-auto grid max-w-180 grow grid-cols-[repeat(var(--app-menu-item-count),minmax(0,1fr))] items-center gap-1',
  'md:mx-0 md:flex md:w-auto md:flex-[0_1_auto] md:justify-center md:gap-0.5',
)

export const APP_MENU_TRAILING_ITEMS_CLASSES = cx(
  'absolute right-0 hidden items-center gap-2 px-4',
  'md:static md:flex md:flex-none md:px-0 lg:flex',
)

/**
 * Builds button classes for app menu items based on compact mode.
 *
 * @param isCompactMobileMenu Whether the menu is using its compact mobile presentation.
 * @returns Tailwind classes for each app menu button.
 */
export function getAppMenuButtonClasses(isCompactMobileMenu: boolean): string {
  return cx(
    'w-full flex-col items-center justify-center gap-0.75 md:w-auto md:flex-row md:gap-1.75 md:rounded-full md:px-2.5',
    'transition-[height,gap,padding-inline] duration-260 ease-[ease]',
    isCompactMobileMenu ? '[--btn-padding-x:0] [--btn-size:2rem]' : '[--btn-size:3rem]',
  )
}

/**
 * Builds root nav classes for the app menu.
 *
 * @param isCompactMobileMenu Whether the menu is using its compact mobile presentation.
 * @param className Optional consumer-supplied classes.
 * @returns Tailwind classes for the app menu nav container.
 */
export function getAppMenuNavClasses(
  isCompactMobileMenu: boolean,
  className?: string,
): string {
  return cx(
    'fixed inset-x-0 bottom-0 z-100 w-full border-t-3 border-base-300 bg-black px-4 caret-transparent',
    'transition-[padding] duration-260 ease-[ease]',
    isCompactMobileMenu ? 'py-1.5' : 'py-4',
    'md:left-1/2 md:right-auto md:bottom-6 md:w-auto md:min-h-0 md:max-w-[calc(100vw-2rem)] md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:pb-[env(safe-area-inset-bottom)] md:pointer-events-none md:[transform:translateX(calc(-50%+var(--app-menu-offset-x)))]',
    className,
  )
}

/**
 * Builds CSS custom properties for the app menu root.
 *
 * @param itemCount Number of primary items in the menu.
 * @param offsetX Horizontal offset in pixels.
 * @returns Inline CSS variable declarations.
 */
export function getAppMenuNavStyles(itemCount: number, offsetX: number): string {
  return cssVars(
    { '--app-menu-item-count': String(itemCount) },
    { '--app-menu-offset-x': `${offsetX}px` },
  )
}
