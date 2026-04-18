<script lang="ts">
import type { Snippet } from 'svelte'
import { flip } from 'svelte-auto-animate'
import type { CardWrapperProps } from '../card.types'

type Props = CardWrapperProps & { children?: Snippet }

let {
  class: className = '',
  isAnimated = false,
  flipDisabled = false,
  children,
}: Props = $props()

function maybeFlip(
  node: HTMLElement,
  params: { isAnimated: boolean; flipDisabled: boolean },
): {
  update: (next: { isAnimated: boolean; flipDisabled: boolean }) => void
  destroy: () => void
} {
  let state = params
  let controller: ReturnType<typeof flip> | undefined

  const sync = (): void => {
    if (!state.isAnimated) {
      controller?.destroy?.()
      controller = undefined
      return
    }

    if (!controller) controller = flip(node)

    if (state.flipDisabled) {
      controller.disable()
      return
    }

    controller.enable()
  }

  sync()

  return {
    update(next) {
      state = next
      sync()
    },
    destroy() {
      controller?.destroy?.()
      controller = undefined
    },
  }
}
</script>

<div class={className} use:maybeFlip={{ isAnimated, flipDisabled }}>
  {@render children?.()}
</div>
