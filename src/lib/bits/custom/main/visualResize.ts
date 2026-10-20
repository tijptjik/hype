/** Resize activity shared with visual-section renderers without exposing map instances. */
export const VISUAL_RESIZE_CONTEXT = Symbol('visual-section-resize')
export type VisualResizeContext = { readonly active: boolean }
