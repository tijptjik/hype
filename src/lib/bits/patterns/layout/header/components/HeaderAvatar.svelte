<script lang="ts">
// BITS COMPONENTS
import { Avatar } from '$lib/bits/core'
// SVELTE
import { fly } from 'svelte/transition'
// TYPES
import type { HeaderAvatarProps } from './headerPrimitives.types'

let {
  isVisible = true,
  name = null,
  src = null,
  alt = '',
  fallback = '',
  onClick,
  transitionDirection = 'right',
}: HeaderAvatarProps = $props()

const transitionX = $derived(transitionDirection === 'left' ? -64 : 64)
</script>

<div
  class={[
    'bits-pattern-header__avatar-shell',
    isVisible
      ? 'bits-pattern-header__avatar-shell--visible'
      : 'bits-pattern-header__avatar-shell--hidden',
  ]
    .filter(Boolean)
    .join(' ')}
>
  {#if isVisible}
    <button
      in:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 350 }}
      out:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 20 }}
      type="button"
      class="bits-pattern-header__avatar-button"
      onclick={() => onClick?.()}
      aria-label="Open admin panel"
    >
      <Avatar {name} {src} {alt} {fallback} />
    </button>
  {/if}
</div>
