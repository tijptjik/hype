// SVELTE
import { getContext, hasContext, setContext } from 'svelte'

const RESPONSIVE_CONTEXT_KEY = Symbol('responsive-context')

export type ResponsiveDimensions = {
  width: number
  height: number
}

export class ResponsiveCtx {
  window = $state({
    width: 0,
    height: 0,
  })
  main = $state({
    width: 0,
    height: 0,
  })
}

export function setResponsiveCtx(): ResponsiveCtx {
  return setContext(RESPONSIVE_CONTEXT_KEY, new ResponsiveCtx())
}

export function getResponsiveCtx(): ResponsiveCtx {
  if (hasContext(RESPONSIVE_CONTEXT_KEY)) {
    return getContext<ResponsiveCtx>(RESPONSIVE_CONTEXT_KEY)
  }

  throw new Error('ResponsiveCtx is not set')
}
