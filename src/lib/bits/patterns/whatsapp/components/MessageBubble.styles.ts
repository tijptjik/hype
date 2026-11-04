/** Actions sit beside the bubble; its width leaves room for one unwrapped icon row. */
export const messageActionsClass = [
  'pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 opacity-0',
  'transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none',
  'group-hover/message:pointer-events-auto group-hover/message:translate-x-0 group-hover/message:opacity-100',
  'group-focus-within/message:pointer-events-auto group-focus-within/message:translate-x-0 group-focus-within/message:opacity-100',
  'data-[open]:pointer-events-auto data-[open]:translate-x-0 data-[open]:opacity-100',
].join(' ')

/** Keep every direct action the same fixed size, including when space is tight. */
export const messageActionButtonClass = 'size-8! min-h-0! min-w-0! shrink-0'
