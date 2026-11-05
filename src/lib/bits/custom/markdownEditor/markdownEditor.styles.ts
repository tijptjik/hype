// STYLES
import { cx } from '#lib/bits/utils.js'

/** Keep the third-party editor inside the form's typography, geometry and theme. */
export const markdownEditorStyles = cx(
  // Crepe's stock margins wrap a desktop toolbar and create a large tinted slab.
  '[&_.milkdown-top-bar]:static! [&_.milkdown-top-bar]:bg-transparent! [&_.milkdown-top-bar]:min-h-9! [&_.milkdown-top-bar]:px-2! [&_.milkdown-top-bar]:py-1! [&_.milkdown-top-bar]:border-border/40!',
  '[&_.top-bar-inner]:gap-0! [&_.top-bar-item]:m-0.5! [&_.top-bar-item]:size-7! [&_.top-bar-item]:p-1! [&_.top-bar-item_svg]:size-[18px]!',
  '[&_.top-bar-divider]:mx-1! [&_.top-bar-divider]:my-0! [&_.top-bar-divider]:h-4! [&_.top-bar-heading-selector]:p-0! [&_.top-bar-heading-button]:h-7! [&_.top-bar-heading-button]:w-24! [&_.top-bar-heading-button]:px-1!',
  '[&_.top-bar-heading-label]:min-w-16! [&_.top-bar-heading-label]:text-xs! [&_.top-bar-heading-label]:font-medium! [&_.top-bar-chevron]:size-4!',
  '[&_.top-bar-item_svg]:fill-current! [&_.top-bar-item_svg]:text-foreground! [&_.top-bar-item.active_svg]:text-primary! [&_.top-bar-chevron_svg]:stroke-foreground! [&_.milkdown_button:focus-visible]:outline-2! [&_.milkdown_button:focus-visible]:outline-primary!',
  'min-h-48 min-w-0 [&_.ProseMirror]:min-h-48 [&_.ProseMirror]:px-5! [&_.ProseMirror]:py-4! [&_.ProseMirror>:first-child]:mt-0!',
  '[&_.ProseMirror_h1]:text-2xl! [&_.ProseMirror_h2]:text-xl! [&_.ProseMirror_h3]:text-lg!',
  '[&_.milkdown]:bg-transparent! [&_.milkdown]:[--crepe-color-background:var(--color-background)]! [&_.milkdown]:[--crepe-color-on-background:var(--color-foreground)]!',
  '[&_.milkdown]:[--crepe-color-surface:var(--color-muted)]! [&_.milkdown]:[--crepe-color-surface-low:var(--color-muted)]! [&_.milkdown]:[--crepe-color-on-surface:var(--color-foreground)]! [&_.milkdown]:[--crepe-color-on-surface-variant:var(--color-muted-foreground)]!',
  '[&_.milkdown]:[--crepe-color-primary:var(--color-primary)]! [&_.milkdown]:[--crepe-color-outline:var(--color-border)]! [&_.milkdown]:[--crepe-color-hover:var(--color-muted)]! [&_.milkdown]:[--crepe-color-selected:var(--color-accent)]!',
  '[&_.milkdown]:[--crepe-font-default:var(--font-sans)]! [&_.milkdown]:[--crepe-font-title:var(--font-sans)]!',
)
