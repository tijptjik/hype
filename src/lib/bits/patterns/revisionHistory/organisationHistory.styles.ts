// STYLES
import { cx } from '#lib/bits/utils.js'

const focus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'
const grid =
  'grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] sm:gap-x-6'
const cell = 'flex min-w-0 gap-2 py-2 sm:py-3'

export const historyStyles = {
  tab: cx(
    'inline-flex min-h-12 min-w-0 items-center gap-2 border-b-2 border-transparent py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:text-primary',
    focus,
  ),
  button: cx(
    'inline-flex min-h-9 items-center justify-center rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:cursor-wait disabled:opacity-50',
    focus,
  ),
  disclosure: cx(
    'ml-auto flex shrink-0 items-center gap-3 rounded-sm py-1 text-left hover:bg-primary/3',
    focus,
  ),
  columns: cx(
    grid,
    'border-y border-border/40 px-3 py-2 text-xs text-muted-foreground',
  ),
  row: cx(grid, 'px-3 pb-3 sm:pb-0'),
  before: cx(cell, 'text-muted-foreground'),
  after: cx(cell, 'text-foreground'),
  notice: 'flex flex-wrap items-center gap-4 px-6 py-5 text-sm text-muted-foreground',
} as const
