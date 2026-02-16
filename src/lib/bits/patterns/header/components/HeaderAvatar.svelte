<script lang="ts">
// BITS COMPONENTS
import { Avatar } from '$lib/bits/core'
// SVELTE
import { fly } from 'svelte/transition'
// TYPES
import type { HeaderAvatarProps } from './headerPrimitives.types'

let {
  visible = true,
  name = null,
  src = null,
  alt = '',
  fallback = '',
  onClick,
  transitionDirection = 'right',
}: HeaderAvatarProps = $props()

const transitionX = $derived(transitionDirection === 'left' ? -64 : 64)
</script>

{#if visible}
  <button
    in:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 350  }}
    out:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 20  }}
    type="button"
    class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0.5 text-xl transition-colors duration-300 hover:bg-primary/20"
    onclick={() => onClick?.()}
    aria-label="Open admin panel"
  >
    <Avatar {name} {src} {alt} {fallback} />
  </button>
{/if}
