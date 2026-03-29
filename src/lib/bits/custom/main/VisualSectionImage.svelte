<script lang="ts">
import { cx } from '$lib/bits'
import * as ImagePrimitive from '$lib/bits/patterns/images/components'
import ImageIcon from 'virtual:icons/lucide/image'
import type { MainVisualSectionImageProps } from './main.types'

let {
  class: className = '',
  href = undefined,
  src = null,
  alt,
  isPending = false,
  isCollapsed = false,
  emptyText = 'No image available',
  onImageLoad,
}: MainVisualSectionImageProps = $props()

const rootClass = $derived(
  cx(
    'relative w-full min-h-0',
    !isCollapsed && 'h-full',
    isCollapsed && 'self-start',
    className,
  ),
)
const mediaClass = $derived(
  cx(
    'relative flex h-full min-h-0 w-full overflow-hidden border-0 bg-transparent',
    'items-center justify-center',
  ),
)
const imageItem = $derived(
  src
    ? {
        id: src,
        src,
        alt,
      }
    : null,
)
</script>

<div class={rootClass}>
  <a class={mediaClass} {href}>
    {#if src}
      <ImagePrimitive.ImageSurface
        item={imageItem}
        fit={isCollapsed ? 'cover' : 'fit'}
        isLoading={isPending}
        showBackdrop={!isCollapsed}
        class="h-full w-full"
        rounded="rounded-none"
        onLoad={size => {
          if (!size) return
          onImageLoad?.(size)
        }}
      />
    {:else}
      <div
        class="flex h-full min-h-[18rem] w-full items-center justify-center text-center text-[color:color-mix(in_oklab,var(--color-base-content)_68%,transparent)]"
      >
        <div>
          <ImageIcon class="mx-auto mb-3 h-8 w-8" />
          <p>{emptyText}</p>
        </div>
      </div>
    {/if}
  </a>
</div>
