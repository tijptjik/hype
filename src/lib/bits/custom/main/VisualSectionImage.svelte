<script lang="ts">
import { cx } from '$lib/bits'
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
    isCollapsed ? 'items-center justify-center' : 'items-center justify-end',
  ),
)
const imageClass = $derived(
  cx(
    'block transition-[filter,opacity] duration-[220ms]',
    isCollapsed
      ? 'absolute inset-0 h-full w-full object-cover object-center'
      : 'h-full w-full object-contain object-right',
    isPending && 'blur-[10px] opacity-[0.58]',
  ),
)
</script>

<div class={rootClass}>
  <a class={mediaClass} {href}>
    {#if src}
      <img
        class={imageClass}
        {src}
        {alt}
        aria-label={alt}
        onload={event => {
          const image = event.currentTarget as HTMLImageElement
          onImageLoad?.({
            width: image.naturalWidth,
            height: image.naturalHeight,
          })
        }}
      >
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
