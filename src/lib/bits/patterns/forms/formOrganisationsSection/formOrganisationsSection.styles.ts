// STYLE UTILITIES
import { cx } from '#lib/bits/utils.js'
import { formSearchHeaderStyles } from '../formSurface/formSearchHeader.styles'

// Keep section actions compact enough for the complete heading on narrow screens.
export const organisationHeaderStyles = cx(
  formSearchHeaderStyles,
  String.raw`[&_.bits-form\_\_section-header-right]:pr-0! [&_.bits-header\_\_title]:overflow-visible! [&_.bits-header\_\_title]:whitespace-normal! [&_.bits-header\_\_title]:break-words!`,
)

// Compact rows retain the shared cards while allowing long names to grow.
export const organisationListStyles = cx(
  'bits-form__parent-resource-list gap-0! py-2!',
  '[&>article+article]:border-t! [&>article+article]:border-border/50!',
)
export const organisationRowStyles = cx(
  'grid! h-auto! min-h-24! items-center! gap-x-4! gap-y-4! overflow-visible! py-2!',
  'grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)] @min-[56rem]:grid-cols-[5rem_minmax(0,1fr)_auto]',
)
export const organisationMediaStyles = 'size-16! min-w-16! sm:size-20! sm:min-w-20!'

// Move the descriptive policy controls beneath the name when a third column would crowd it.
export const organisationActionsStyles =
  'col-span-2 justify-self-end pr-0! @min-[56rem]:col-span-1'
