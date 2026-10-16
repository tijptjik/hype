import { cx } from '#lib/bits/utils.js'

// Image-first search tiles keep names legible on both light and dark basemaps.
export const mapStyleResultStyles = cx(
  'relative min-h-40! overflow-hidden rounded-md! p-0!',
  String.raw`[&_.bits-search-result-item\_\_content--visual]:relative [&_.bits-search-result-item\_\_content--visual]:h-40 [&_.bits-search-result-item\_\_content--visual]:w-full`,
  String.raw`[&_.bits-search-result-item\_\_copy]:absolute [&_.bits-search-result-item\_\_copy]:bottom-2 [&_.bits-search-result-item\_\_copy]:right-2 [&_.bits-search-result-item\_\_copy]:max-w-[calc(100%-1rem)] [&_.bits-search-result-item\_\_copy]:rounded-md [&_.bits-search-result-item\_\_copy]:bg-panel/95 [&_.bits-search-result-item\_\_copy]:px-2 [&_.bits-search-result-item\_\_copy]:py-1.5 [&_.bits-search-result-item\_\_copy]:text-right [&_.bits-search-result-item\_\_copy]:shadow-sm`,
  String.raw`[&_.bits-search-result-item\_\_title]:text-sm [&_.bits-search-result-item\_\_title]:text-foreground [&_.bits-search-result-item\_\_discriminator]:pr-0 [&_.bits-search-result-item\_\_discriminator]:text-muted-foreground`,
)
