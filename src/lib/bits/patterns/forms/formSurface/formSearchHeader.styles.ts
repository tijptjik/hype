import { cx } from '#lib/bits/utils.js'

// Keep header columns stable through search outros; stack only in narrow sections.
export const formSearchHeaderStyles = cx(
  'h-auto! min-h-[68px]! grid-cols-1! gap-y-3 py-3! @min-[40rem]:h-[68px]! @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]! @min-[40rem]:gap-x-6 @min-[40rem]:py-0!',
  String.raw`[&_.bits-form\_\_section-header-right]:w-full [&_.bits-form\_\_section-header-right]:pr-0 [&_.bits-form\_\_section-header-right]:[container-type:normal]`,
  String.raw`[&_.bits-form\_\_section-header-right:empty]:hidden`,
  '[&_.bits-search]:w-full [&_.bits-search-bar]:mb-0 [&_.bits-search-bar_input]:h-10',
  String.raw`[&_.bits-form\_\_capabilities-search]:w-full! [&_.bits-form\_\_capabilities-search]:max-w-none`,
)

// Member validation sits beside search on wide sections and wraps within the header.
export const formMemberIssuesHeaderStyles = cx(
  formSearchHeaderStyles,
  '@min-[40rem]:h-auto! @min-[40rem]:grid-cols-1! @min-[40rem]:py-3! @min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,48rem)]!',
)

// Compact selector inputs live in the heading; results anchor to its full width.
export const formSelectionSearchHeaderStyles = cx(
  'relative! overflow-visible! h-[68px]! min-h-[68px]! grid-cols-[minmax(0,1fr)_auto_auto]! gap-x-3 py-0!',
  String.raw`[&_.bits-form\_\_section-header-right]:col-start-3 [&_.bits-form\_\_section-header-right]:row-start-1 [&_.bits-form\_\_section-header-right]:static! [&_.bits-form\_\_section-header-right]:[container-type:normal]! [&_.bits-form\_\_section-header-right]:overflow-visible! [&_.bits-form\_\_section-header-right]:pr-0`,
  '[&_.bits-search]:static! [&_.bits-search]:w-full [&_.bits-search-bar]:mb-0 [&_.bits-search-bar_input]:h-9',
  String.raw`[&_.bits-search\_\_results]:absolute! [&_.bits-search\_\_results]:left-6! [&_.bits-search\_\_results]:right-6! [&_.bits-search\_\_results]:top-full! [&_.bits-search\_\_results]:mx-0! [&_.bits-search\_\_results]:mt-1! [&_.bits-search\_\_results]:w-auto! [&_.bits-search\_\_results]:z-[170]`,
)
