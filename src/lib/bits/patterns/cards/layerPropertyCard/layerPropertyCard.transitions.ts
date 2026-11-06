// SVELTE
import { cubicInOut } from 'svelte/easing'
import { crossfade } from 'svelte/transition'
// TYPES
import type { TransitionConfig } from 'svelte/transition'

type TransferParams = { key: string; disabled: boolean }
type TransferTransition = (
  node: Element,
  params: TransferParams,
) => () => TransitionConfig

export type LayerPropertyTransfer = {
  send: TransferTransition
  receive: TransferTransition
}

/**
 * Connects the two field columns with a shared flying FLIP transition.
 * @returns A send/receive pair scoped to one layer editor.
 * @remarks Unpaired rows appear immediately; route changes and reduced motion skip flight.
 */
export function createLayerPropertyTransfer(): LayerPropertyTransfer {
  const [send, receive] = crossfade({
    duration: 420,
    easing: cubicInOut,
    fallback: () => ({ duration: 0 }),
  })

  /**
   * Adds a small outward tilt to the matched positional transition.
   * @param transition Svelte's paired crossfade transition.
   * @returns A motion-aware field transition.
   */
  function withTilt(transition: typeof send): TransferTransition {
    return (node, params) => {
      const resolve = transition(node, params)
      return () => {
        const config = resolve()
        if (
          params.disabled ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return { duration: 0 }

        const css = config.css
        if (!css) return config

        // Keep the flying row above its siblings without intercepting another click.
        return {
          ...config,
          css: (t, u) => `${css(t, u)}
            z-index: 10;
            pointer-events: none;
            rotate: y ${Math.sin(Math.PI * t) * 12}deg;
          `,
        }
      }
    }
  }

  return { send: withTilt(send), receive: withTilt(receive) }
}
