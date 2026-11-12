/** Match the shared Fields editor's quiet settings controls. */
export const typeInputAppearance = {
  controlClass:
    'rounded-md! border-border/30! bg-transparent! px-0! hover:border-border/60! hover:bg-muted/50!',
  inputClass: 'h-10! px-[11px]!',
}
export const typeSelectAppearance = {
  displayClass: 'h-[42px]! rounded-md! border-transparent! bg-transparent! pl-[11px]!',
  triggerClass:
    'h-[42px]! rounded-md! border-border/30! bg-transparent! pl-[11px]! hover:border-border/60! hover:bg-muted/50! [&_.bits-form\\_\\_select-label]:pl-0!',
}

/** Read-only values have no input outline or hover affordance. */
export const typeReadOnlyInputAppearance = {
  controlClass: 'rounded-md! border-transparent! bg-transparent! px-0! shadow-none!',
  inputClass: 'h-10! px-[11px]!',
}
