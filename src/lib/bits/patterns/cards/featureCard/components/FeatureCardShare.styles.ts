// BITS
import { cx } from '#lib/bits/utils.js'

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'
const tile =
  'flex min-w-0 items-center justify-center gap-2.5 rounded-xl px-3 py-3 text-center text-sm font-medium whitespace-normal break-words transition-[filter,box-shadow] duration-150 hover:brightness-110 motion-reduce:transition-none'

export const shareStyles = {
  platform: cx(tile, focus, 'min-h-14 text-white shadow-sm'),
  platformIcon: 'size-6 shrink-0',
  facebook: 'bg-[#0866ff]',
  threads: 'bg-[#101010]',
  x: 'bg-[#14171a]',
  instagram: 'bg-[linear-gradient(135deg,#833ab4_0%,#c13584_55%,#b93b23_100%)]',
  utility: cx(
    tile,
    focus,
    'min-h-12 px-2 border border-base-content/20 bg-base-content/5 text-base-content hover:bg-base-content/10 disabled:opacity-40',
  ),
  auxiliary: cx(
    focus,
    'flex min-h-11 items-center justify-center gap-3 rounded-xl border border-base-content/15 px-4 py-3 text-center text-sm text-base-content hover:bg-base-content/10 disabled:opacity-40',
  ),
} as const
