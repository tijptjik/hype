// SVELTE
import { getContext, hasContext, setContext } from 'svelte'
// LIB
import { MOBILE_MAX_WIDTH } from '#lib/constants.js'

const RESPONSIVE_CONTEXT_KEY = Symbol('responsive-context')

export type ResponsiveDimensions = {
  width: number
  height: number
}

export type ResponsiveViewport = ResponsiveDimensions & {
  offsetTop: number
  offsetLeft: number
}

/** Browser measurements shared by all route surfaces. */
export class ResponsiveCtx {
  window = $state({
    width: 0,
    height: 0,
  })
  viewport = $state<ResponsiveViewport>({
    width: 0,
    height: 0,
    offsetTop: 0,
    offsetLeft: 0,
  })
  get isMobile(): boolean {
    return this.window.width < MOBILE_MAX_WIDTH
  }

  get visibleWindowHeight(): number {
    return this.viewport.height || this.window.height
  }

  get visibleWindowWidth(): number {
    return this.viewport.width || this.window.width
  }

  get keyboardInsetHeight(): number {
    return Math.max(
      0,
      this.window.height - this.visibleWindowHeight - this.viewport.offsetTop,
    )
  }

  /** Updates layout viewport measurements. @param width Layout width. @param height Layout height. @returns Nothing. */
  setWindowDimensions(width: number, height: number): void {
    if (this.window.width !== width) {
      this.window.width = width
    }

    if (this.window.height !== height) {
      this.window.height = height
    }
  }

  /** Updates visual viewport measurements. @param width Visible width. @param height Visible height. @param offsetTop Top offset. @param offsetLeft Left offset. @returns Nothing. */
  setViewportDimensions(
    width: number,
    height: number,
    offsetTop: number = 0,
    offsetLeft: number = 0,
  ): void {
    if (this.viewport.width !== width) {
      this.viewport.width = width
    }

    if (this.viewport.height !== height) {
      this.viewport.height = height
    }

    if (this.viewport.offsetTop !== offsetTop) {
      this.viewport.offsetTop = offsetTop
    }

    if (this.viewport.offsetLeft !== offsetLeft) {
      this.viewport.offsetLeft = offsetLeft
    }
  }
}

/** Provides root browser measurements. @returns The new context. */
export function setResponsiveCtx(): ResponsiveCtx {
  return setContext(RESPONSIVE_CONTEXT_KEY, new ResponsiveCtx())
}

/** Resolves root browser measurements. @returns The current context. */
export function getResponsiveCtx(): ResponsiveCtx {
  if (hasContext(RESPONSIVE_CONTEXT_KEY)) {
    return getContext<ResponsiveCtx>(RESPONSIVE_CONTEXT_KEY)
  }

  throw new Error('ResponsiveCtx is not set')
}
