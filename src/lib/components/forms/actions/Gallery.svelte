<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, XMark, Trash } from '@steeze-ui/heroicons';

// SERVICES
const imageCtx = getImageCtx();

type GalleryActionsProps = {
  removeMode: boolean;
  actions: Record<'add' | 'remove', (...args: any[]) => void>;
};

// STATE : PROPS
let { removeMode = $bindable(false), actions }: GalleryActionsProps = $props();

// Add and remove event listener
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && removeMode) {
      removeMode = false;
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});

$effect(() => {
  if (imageCtx.getImages().length == 0) {
    removeMode = false;
  }
});
</script>

<div class="flex flex-row items-center justify-between">
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost ml-auto h-12 flex-nowrap whitespace-nowrap text-nowrap font-bold"
      onclick={(e) => actions?.add(e)}
      data-testid="addImageButton">
      <Icon src={Photo} class="mr-2 h-6 w-6 stroke-[2px]" />
      <span class="hidden md:block">{m.wacky_home_sawfish_accept()}</span>
    </button>
  {/if}
  {#if imageCtx.getImages().length > 0}
    <button
      class="btn-rounded btn btn-ghost ml-auto h-12 flex-nowrap overflow-hidden whitespace-nowrap text-nowrap font-bold"
      onclick={(e) => actions?.remove(e)}
      transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
      {#if !removeMode}
        <Icon src={Trash} class="mr-2 h-6 w-6 stroke-[2px]" />
        <span class="hidden text-nowrap md:block">{m.watery_trite_shrimp_clip()}</span>
      {:else}
        <Icon src={XMark} class="h-6 w-6 stroke-[2px]" />
        <span class="hidden whitespace-nowrap text-nowrap md:block"
          >{m.long_level_kestrel_pet()}</span>
      {/if}
    </button>
  {/if}
</div>
