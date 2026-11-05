import { cx } from '#lib/bits/utils.js'

// Measure intrinsic content first; only the final stage gives space to scrolling.
export const responsiveSectionHeaderClasses = cx(
  String.raw`sticky top-0 z-30 shrink-0 bg-panel min-w-0`,
  String.raw`[&>header]:flex! [&>header]:flex-nowrap! [&>header]:gap-2!`,
  String.raw`[&_.bits-form\_\_section-header-left]:flex-none! [&_.bits-form\_\_section-header-left]:overflow-visible!`,
  String.raw`[&_.bits-form\_\_section-header-right]:flex-nowrap! [&_.bits-form\_\_section-header-right]:[container-type:normal]!`,
  String.raw`[&_.bits-header]:shrink-0 [&_.bits-header]:w-max! [&_.bits-header\_\_title]:whitespace-nowrap! [&_.bits-header\_\_subtitle]:whitespace-nowrap!`,
  String.raw`[&_[data-locale-toolbar]]:flex-none!`,
  String.raw`[&:not([data-fit="0"])_[data-control-label]]:hidden!`,
  String.raw`[&:is([data-fit="2"],[data-fit="3"],[data-fit="4"])_.bits-header\_\_subtitle]:hidden!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_.bits-header]:w-auto!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_.bits-header]:min-w-0!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_.bits-header]:shrink!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_.bits-form\_\_section-header-left]:flex-[0_1_auto]!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_.bits-form\_\_section-header-left]:min-w-[var(--section-header-min-width,8rem)]!`,
  String.raw`[&:is([data-fit="3"],[data-fit="4"])_[data-header-title-text]]:min-w-[var(--section-header-title-min-width)]!`,
  String.raw`[&_[data-header-title-text]]:overflow-hidden! [&_[data-header-title-text]]:text-ellipsis!`,
  String.raw`[&[data-fit="4"]_.bits-form\_\_section-header-right]:flex-[1_1_0%]!`,
  String.raw`[&[data-fit="4"]_[data-locale-toolbar]]:flex-[1_1_0%]!`,
  String.raw`[&[data-fit="4"]_.bits-form\_\_section-header-left]:basis-[var(--section-header-min-width,8rem)]!`,
  String.raw`[&:not([data-fit="0"])_button]:px-2!`,
  String.raw`[&[data-fit="4"]>header]:px-1!`,
)
