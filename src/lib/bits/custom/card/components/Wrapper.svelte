<script lang="ts">
import type { Snippet } from 'svelte'
import { flip } from 'svelte-auto-animate'
import type { CardWrapperProps } from '../card.types'

type Props = CardWrapperProps & { children?: Snippet }

let { class: className = '', isAnimated = false, children }: Props = $props()

function maybeFlip(node: HTMLElement): { destroy?: () => void } | void {
  if (!isAnimated) return
  return flip(node)
}
</script>

<div class={className} use:maybeFlip>{@render children?.()}</div>
