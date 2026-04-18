import { cx } from '$lib/bits/utils'

export const textTitleClass = 'w-full text-left font-medium text-base-content'

export function getTextDescriptionClass(isClickable: boolean): string {
  return cx(
    'w-full text-left text-sm text-base-content/60',
    isClickable && 'cursor-pointer hover:text-primary',
  )
}
