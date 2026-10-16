import { cx } from '#lib/bits/utils.js'

// Keep header columns stable through search outros; stack only in narrow sections.
export const formSearchHeaderStyles = cx(
  'h-auto! min-h-[68px]! grid-cols-1! gap-y-3 py-3! @min-[40rem]:h-[68px]! @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]! @min-[40rem]:gap-x-6 @min-[40rem]:py-0!',
  String.raw`[&_.bits-form\_\_section-header-right]:w-full [&_.bits-form\_\_section-header-right]:pr-0 [&_.bits-form\_\_section-header-right]:[container-type:normal]`,
  String.raw`[&_.bits-form\_\_section-header-right:empty]:hidden`,
  '[&_.bits-search]:w-full [&_.bits-search-bar]:mb-0 [&_.bits-search-bar_input]:h-10',
  String.raw`[&_.bits-form\_\_capabilities-search]:w-full! [&_.bits-form\_\_capabilities-search]:max-w-none`,
)
