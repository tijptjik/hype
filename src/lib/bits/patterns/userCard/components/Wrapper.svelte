<script lang="ts">
import type { Snippet } from 'svelte'
import { flip } from 'svelte-auto-animate'
import type { UserCardWrapperProps } from '../userCard.types'

type Props = UserCardWrapperProps & { children?: Snippet }

let { class: className = '', isAnimated = false, children }: Props = $props()

function maybeFlip(node: HTMLElement): { destroy?: () => void } | void {
  if (!isAnimated) return
  return flip(node)
}
</script>

<div class={`bits-form__user-card-wrapper ${className}`} use:maybeFlip>
  {@render children?.()}
</div>
