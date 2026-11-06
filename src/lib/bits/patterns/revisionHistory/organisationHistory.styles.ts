// STYLES
import { cx } from '#lib/bits/utils.js'

const focus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'
const cell = 'min-w-0 space-y-2 p-4'

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
    'ml-auto flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-primary/5 hover:text-foreground',
    focus,
  ),
  entry: 'border-border/60 min-w-0 overflow-hidden rounded-lg border',
  metadata: 'contents',
  label: 'text-muted-foreground text-xs font-medium',
  group: 'grid min-w-0 gap-3',
  comparison: 'border-border/60 bg-panel min-w-0 overflow-hidden rounded-md border',
  fieldHeading:
    'border-border/50 bg-muted/30 flex min-w-0 flex-wrap gap-x-8 gap-y-2 border-b px-4 py-3',
  values:
    'divide-border/40 grid min-w-0 divide-y @[36rem]:grid-cols-2 @[36rem]:divide-x @[36rem]:divide-y-0',
  before: cx(cell, 'text-muted-foreground'),
  after: cx(cell, 'text-foreground'),
  notice: 'flex flex-wrap items-center gap-4 px-6 py-5 text-sm text-muted-foreground',
} as const
