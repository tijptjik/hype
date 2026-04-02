import { cx } from '$lib/bits/utils'
import { cssVars } from '$lib/bits/utils'

const APP_MENU_TRANSITION_CLASSES = 'transition-[padding] duration-260 ease-[ease]'

const APP_MENU_NAV_PANEL_SHARED_CLASSES =
  'pointer-events-auto relative flex w-full min-w-0 items-center justify-between'

const APP_MENU_NAV_PANEL_DESKTOP_CLASSES =
  'md:inline-flex md:h-14 md:w-auto md:max-w-full md:items-center md:justify-center md:gap-1 md:rounded-full md:border md:border-[color-mix(in_oklab,var(--color-base-content)_12%,transparent)] md:bg-[color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] md:px-1.5 md:shadow-[0_18px_48px_rgb(0_0_0_/_0.34)] md:backdrop-blur-[14px] md:px-4'

export const APP_MENU_NAV_PANEL_CLASSES = cx(
  APP_MENU_NAV_PANEL_SHARED_CLASSES,
  APP_MENU_TRANSITION_CLASSES,
  APP_MENU_NAV_PANEL_DESKTOP_CLASSES,
)

const APP_MENU_ITEM_GRID_SHARED_CLASSES =
  'mx-auto grid min-w-0 max-w-180 grow grid-cols-[repeat(var(--app-menu-item-count),minmax(0,1fr))] items-center gap-0.5'

const APP_MENU_ITEM_GRID_DESKTOP_CLASSES =
  'md:mx-0 md:flex md:w-auto md:flex-[0_1_auto] md:grid-cols-none md:justify-center md:gap-1.5'

export const APP_MENU_ITEM_GRID_CLASSES = cx(
  APP_MENU_ITEM_GRID_SHARED_CLASSES,
  APP_MENU_ITEM_GRID_DESKTOP_CLASSES,
)

const APP_MENU_TRAILING_ITEMS_SHARED_CLASSES =
  'hidden flex-none items-center gap-1 pl-1'

const APP_MENU_TRAILING_ITEMS_DESKTOP_CLASSES =
  'md:static md:flex md:flex-none md:px-0 lg:flex'

const APP_MENU_TRAILING_ITEMS_MOBILE_VISIBLE_CLASSES = 'flex'

/**
 * Builds trailing item classes for the app menu.
 *
 * @param hasMobileVisibleTrailingItems Whether any trailing items should render on mobile.
 * @returns Tailwind classes for the trailing items container.
 */
export function getAppMenuTrailingItemsClasses(
  hasMobileVisibleTrailingItems: boolean,
): string {
  return cx(
    APP_MENU_TRAILING_ITEMS_SHARED_CLASSES,
    hasMobileVisibleTrailingItems && APP_MENU_TRAILING_ITEMS_MOBILE_VISIBLE_CLASSES,
    APP_MENU_TRAILING_ITEMS_DESKTOP_CLASSES,
  )
}

const APP_MENU_BUTTON_SHARED_CLASSES =
  'w-full min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.75'

const APP_MENU_BUTTON_DESKTOP_CLASSES =
  'md:w-auto md:flex-none md:basis-auto md:flex-row md:gap-1.5 md:rounded-full md:px-2'

const APP_MENU_BUTTON_TRANSITION_CLASSES =
  'transition-[height,gap,padding-inline] duration-260 ease-[ease]'

const APP_MENU_BUTTON_ICON_ONLY_CLASSES =
  '[--btn-padding-x:clamp(0.125rem,1vw,0.375rem)] [--btn-size:clamp(1.5rem,8vw,2rem)] md:[--btn-padding-x:0.5rem] md:[--btn-size:2.25rem]'

const APP_MENU_BUTTON_LABELLED_CLASSES = '[--btn-size:3rem] md:[--btn-size:2.25rem]'

/**
 * Builds button classes for app menu items based on icon-only mode.
 *
 * @param isIconOnlyMenu Whether the menu is rendering icon-only buttons.
 * @returns Tailwind classes for each app menu button.
 */
export function getAppMenuButtonClasses(isIconOnlyMenu: boolean): string {
  return cx(
    APP_MENU_BUTTON_SHARED_CLASSES,
    APP_MENU_BUTTON_DESKTOP_CLASSES,
    APP_MENU_BUTTON_TRANSITION_CLASSES,
    isIconOnlyMenu
      ? APP_MENU_BUTTON_ICON_ONLY_CLASSES
      : APP_MENU_BUTTON_LABELLED_CLASSES,
  )
}

const APP_MENU_NAV_SHARED_CLASSES =
  'fixed inset-x-0 bottom-0 z-100 mx-auto w-[calc(100%-6rem)] rounded-t-3xl border-2 border-b-0 border-base-300 bg-black px-4 caret-transparent'

const APP_MENU_NAV_ICON_ONLY_MAX_WIDTH_CLASSES = 'max-w-80'

const APP_MENU_NAV_LABELLED_MAX_WIDTH_CLASSES = 'max-w-112'

const APP_MENU_NAV_COMPACT_CLASSES = 'py-1.5'

const APP_MENU_NAV_DEFAULT_CLASSES = 'py-4'

const APP_MENU_NAV_COMPACT_ICON_ONLY_CLASSES = 'px-2'

const APP_MENU_NAV_DESKTOP_CLASSES =
  'md:left-1/2 md:right-auto md:bottom-6 md:w-auto md:min-h-0 md:max-w-[calc(100vw-2rem)] md:border-0 md:bg-transparent md:px-0 md:py-0 md:pb-[env(safe-area-inset-bottom)] md:pointer-events-none md:transform-[translateX(calc(-50%+var(--app-menu-offset-x)))]'

/**
 * Builds root nav classes for the app menu.
 *
 * @param isIconOnlyMenu Whether the menu is currently rendering without visible labels.
 * @param shouldUseCompactVisualMenu Whether the menu is using its compact visual presentation.
 * @param className Optional consumer-supplied classes.
 * @returns Tailwind classes for the app menu nav container.
 */
export function getAppMenuNavClasses(
  isIconOnlyMenu: boolean,
  shouldUseCompactVisualMenu: boolean,
  className?: string,
): string {
  return cx(
    APP_MENU_NAV_SHARED_CLASSES,
    APP_MENU_TRANSITION_CLASSES,
    isIconOnlyMenu
      ? APP_MENU_NAV_ICON_ONLY_MAX_WIDTH_CLASSES
      : APP_MENU_NAV_LABELLED_MAX_WIDTH_CLASSES,
    shouldUseCompactVisualMenu &&
      isIconOnlyMenu &&
      APP_MENU_NAV_COMPACT_ICON_ONLY_CLASSES,
    shouldUseCompactVisualMenu
      ? APP_MENU_NAV_COMPACT_CLASSES
      : APP_MENU_NAV_DEFAULT_CLASSES,
    APP_MENU_NAV_DESKTOP_CLASSES,
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
