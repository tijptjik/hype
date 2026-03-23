import { cx } from '$lib/bits/utils'
import type { IndexCardProps } from '$lib/bits/patterns/cards/indexCard'
import type { RowVariant } from './row.types'

type RowRootClassParams = {
  variant?: RowVariant
  isSelected?: boolean
  className?: string
}

type RowThumbnailClassParams = {
  isClickable: boolean
}

type ResourceRowStatusClassParams = {
  tone?: IndexCardProps['footerStatus'] extends infer T
    ? T extends { tone?: infer Tone }
      ? Tone
      : never
    : never
}

type ResourceRowLayoutClassParams = {
  breadcrumbColumnCount: number
  breadcrumbVariant?: ResourceRowMetaVariant
}

type ResourceRowMetaVariant = 'default' | 'stats'

export const rowShellClass =
  '[container-type:inline-size] [container-name:bits-resource-row] select-none'

export function getRowRootClass({
  variant,
  isSelected = false,
  className = '',
}: RowRootClassParams): string {
  return cx(
    'bits-theme relative grid items-center gap-4 rounded-lg py-1 pl-1.5 caret-transparent shadow-[var(--shadow-mini)] transition-[box-shadow,background,transform] duration-200',
    'cursor-pointer bg-[color-mix(in_oklab,var(--color-base-300)_46%,transparent)]',
    'hover:border-[color-mix(in_oklab,var(--color-base-content)_5%,transparent)]',
    'hover:shadow-[0_1rem_2.2rem_color-mix(in_oklab,black_14%,transparent),0_0_0_1px_color-mix(in_oklab,white_2%,transparent)]',
    'focus-visible:outline-none',
    'focus-visible:border-[color-mix(in_oklab,var(--color-base-content)_5%,transparent)]',
    'focus-visible:-translate-y-px',
    'focus-visible:bg-[color-mix(in_oklab,var(--color-base-200)_78%,var(--color-primary)_6%)]',
    'focus-visible:shadow-[0_1.2rem_2.6rem_color-mix(in_oklab,black_18%,transparent),0_0_0_1px_color-mix(in_oklab,white_8%,transparent),0_0_0_3px_color-mix(in_oklab,var(--color-secondary)_92%,transparent),0_0_0_6px_color-mix(in_oklab,var(--color-primary)_28%,transparent)]',
    'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-transparent',
    'focus-within:border-[color-mix(in_oklab,var(--color-base-content)_5%,transparent)]',
    'focus-within:-translate-y-px',
    'focus-within:bg-[color-mix(in_oklab,var(--color-base-200)_78%,var(--color-primary)_6%)]',
    'focus-within:shadow-[0_1.2rem_2.6rem_color-mix(in_oklab,black_18%,transparent),0_0_0_1px_color-mix(in_oklab,white_8%,transparent),0_0_0_3px_color-mix(in_oklab,var(--color-secondary)_92%,transparent),0_0_0_6px_color-mix(in_oklab,var(--color-primary)_28%,transparent)]',
    'focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-transparent',
    isSelected &&
      'shadow-[0_0_0_2px_var(--color-primary),0_0_0_4px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]',
    variant ? `bits-resource-row--${variant}` : '',
    className,
  )
}

export const rowTitleSectionClass = 'min-w-0 w-full'

export const rowTitleClass = 'flex items-center gap-4 text-left'

export const rowTitleContentClass =
  'flex w-full flex-col items-start overflow-hidden pt-1 text-left'

export function getRowThumbnailClass({ isClickable }: RowThumbnailClassParams): string {
  return cx('relative h-16 w-16 shrink-0', isClickable && 'cursor-pointer')
}

export const rowThumbnailImageClass =
  'h-full w-full rounded-md object-cover text-transparent'

export const rowThumbnailFallbackClass =
  'flex h-full w-full items-center justify-center rounded-md bg-base-200'

export const rowThumbnailFallbackTextClass = 'text-xs text-base-content/60'

export function getResourceRowClass({
  breadcrumbColumnCount,
  breadcrumbVariant = 'default',
}: ResourceRowLayoutClassParams): string {
  return cx(
    'grid-cols-1 gap-3 text-left md:gap-4',
    breadcrumbVariant === 'stats' && 'md:gap-3',
    breadcrumbColumnCount <= 0 && 'md:grid-cols-[minmax(0,1fr)_14rem]',
    breadcrumbColumnCount === 1 && 'md:grid-cols-[minmax(0,1fr)_10rem_14rem]',
    breadcrumbColumnCount === 2 && 'md:grid-cols-[minmax(0,1fr)_20rem_14rem]',
    breadcrumbColumnCount >= 3 &&
      breadcrumbVariant === 'stats' &&
      'md:grid-cols-[minmax(0,1fr)_13rem_14rem]',
    breadcrumbColumnCount >= 3 &&
      breadcrumbVariant !== 'stats' &&
      'md:grid-cols-[minmax(0,1fr)_30rem_14rem]',
  )
}

export function getResourceRowMetaGridClass({
  breadcrumbColumnCount,
  breadcrumbVariant = 'default',
}: ResourceRowLayoutClassParams): string {
  return cx(
    'grid min-w-0 grid-cols-1 gap-2 text-left md:gap-3',
    breadcrumbColumnCount === 1 &&
      'md:w-[10rem] md:min-w-[10rem] md:max-w-[10rem] md:grid-cols-[repeat(1,minmax(10rem,1fr))]',
    breadcrumbColumnCount === 2 &&
      'md:w-[20rem] md:min-w-[20rem] md:max-w-[20rem] md:grid-cols-[repeat(2,minmax(10rem,1fr))]',
    breadcrumbColumnCount >= 3 &&
      breadcrumbVariant === 'stats' &&
      'md:w-[13rem] md:min-w-[13rem] md:max-w-[13rem] md:grid-cols-[repeat(3,64px)] md:justify-end md:gap-2',
    breadcrumbColumnCount >= 3 &&
      breadcrumbVariant !== 'stats' &&
      'md:w-[30rem] md:min-w-[30rem] md:max-w-[30rem] md:grid-cols-[repeat(3,minmax(10rem,1fr))]',
  )
}

export const resourceRowMetaCellClass = 'min-w-0'

export const resourceRowMetaItemClass =
  'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2'

export const resourceRowMetaItemStatsClass =
  'grid h-full w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5'

export const resourceRowRailSurfaceClass = 'bg-base-300/70'

export const resourceRowMetaIconClass = cx(
  'inline-flex h-8 w-8 items-center justify-center rounded-full',
  resourceRowRailSurfaceClass,
)

export const resourceRowMetaIconSvgClass = 'h-3.5 w-3.5'

export const resourceRowMetaLabelClass =
  'flex min-w-0 items-center justify-center truncate text-center text-sm text-base-content'

export const resourceRowMetaLabelStatsClass =
  'flex min-w-0 items-center justify-center truncate text-center text-[1.55rem] font-semibold leading-none tracking-tight text-base-content'

export function getResourceRowMetaItemClass(variant: ResourceRowMetaVariant): string {
  return variant === 'stats' ? resourceRowMetaItemStatsClass : resourceRowMetaItemClass
}

export function getResourceRowMetaLabelClass(variant: ResourceRowMetaVariant): string {
  return variant === 'stats'
    ? resourceRowMetaLabelStatsClass
    : resourceRowMetaLabelClass
}

export const resourceRowStatusRailClass = cx(
  'flex items-center justify-center self-stretch text-left',
  '-my-1 -mr-1 rounded-r-lg px-3 py-2',
  'w-full md:w-56 md:min-w-56',
  resourceRowRailSurfaceClass,
)

export function getResourceRowStatusClass({
  tone,
}: ResourceRowStatusClassParams): string {
  return cx(
    'bits-index-card__status bits-index-card__status-shell',
    tone === 'published' && 'bits-index-card__status--published',
    tone === 'draft' && 'bits-index-card__status--draft',
  )
}
