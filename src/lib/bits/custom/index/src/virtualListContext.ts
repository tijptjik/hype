// SVELTE
import { getContext, setContext } from 'svelte'

const VIRTUAL_LIST_RENDER_CONTEXT_KEY = Symbol('virtual-list-render-context')

export type VirtualListRenderContext = {
  canRenderSecondary: boolean
  isScrolling: boolean
  isScrollbarDragging: boolean
}

export function setVirtualListRenderContext(
  context: VirtualListRenderContext,
): VirtualListRenderContext {
  return setContext(VIRTUAL_LIST_RENDER_CONTEXT_KEY, context)
}

export function getVirtualListRenderContext(): VirtualListRenderContext | undefined {
  return getContext<VirtualListRenderContext>(VIRTUAL_LIST_RENDER_CONTEXT_KEY)
}
