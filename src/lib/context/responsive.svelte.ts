// SVELTE
import { getContext, hasContext, setContext } from 'svelte'
// LIB
import {
  getMenuClearanceHeight,
  getMenuReservedHeight,
} from '$lib/bits/patterns/bars/appMenu/appMenu.constants'

const RESPONSIVE_CONTEXT_KEY = Symbol('responsive-context')

export type ResponsiveDimensions = {
  width: number
  height: number
}

export type ResponsiveViewport = ResponsiveDimensions & {
  offsetTop: number
  offsetLeft: number
}

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
  main = $state({
    width: 0,
    height: 0,
  })

  get menuClearanceHeight(): number {
    return getMenuClearanceHeight(this.window.width, this.window.height)
  }

  get menuReservedHeight(): number {
    return getMenuReservedHeight(this.window.width, this.window.height)
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

  setWindowDimensions(width: number, height: number): void {
    if (this.window.width !== width) {
      this.window.width = width
    }

    if (this.window.height !== height) {
      this.window.height = height
    }
  }

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

  setMainDimensions(width: number, height: number): void {
    if (this.main.width !== width) {
      this.main.width = width
    }

    if (this.main.height !== height) {
      this.main.height = height
    }
  }
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
