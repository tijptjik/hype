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
  emptyText = 'No image available',
  onImageLoad,
}: MainVisualSectionImageProps = $props()

const rootClass = $derived(cx('relative h-full w-full min-h-0', className))
const imageClass = $derived(
  cx(
    'block h-full w-full object-contain object-right transition-[filter,opacity] duration-[220ms]',
    isPending && 'blur-[10px] opacity-[0.58]',
  ),
)
</script>

<div class={rootClass}>
  <a
    class="flex h-full min-h-0 w-full items-center justify-end overflow-hidden border-0 bg-transparent"
    {href}
  >
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
