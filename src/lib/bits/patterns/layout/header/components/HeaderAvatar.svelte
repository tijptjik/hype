<script lang="ts">
// BITS COMPONENTS
import { Avatar, Button } from '$lib/bits/core'
// SVELTE
import { fly } from 'svelte/transition'
// TYPES
import type { HeaderAvatarProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderAvatarShellClasses,
  HEADER_AVATAR_BUTTON_CLASSES,
} from './headerPrimitives.styles'

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

{#snippet avatarIcon()}
  <Avatar {name} {src} {alt} {fallback} fitHeight={true} />
{/snippet}

{#if isVisible}
  <div
    class={getHeaderAvatarShellClasses(isVisible)}
    in:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 350 }}
    out:fly={{ x: transitionX, duration: 260, opacity: 1, delay: 20 }}
  >
    <Button
      text="Open admin panel"
      icon={avatarIcon}
      modifier="circle"
      style="transparent"
      iconClasses="h-full w-full"
      class={HEADER_AVATAR_BUTTON_CLASSES}
      hideLabel={true}
      hideLabelInstantly={true}
      onClick={() => onClick?.()}
    />
  </div>
{/if}
