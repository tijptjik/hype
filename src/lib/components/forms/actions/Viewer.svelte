<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// EASING
import { cubicInOut } from 'svelte/easing'
// TRANSITIONS
import { slide } from 'svelte/transition'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import { ArrowDownTray } from '@steeze-ui/heroicons'
import Icon from '$lib/components/common/Icon.svelte'
import Toggle from '$lib/components/forms/fields/Toggle.svelte'

// SERVICES
const imageCtx = getImageCtx()
</script>

{#if imageCtx.activeImage}
  <div
    class="flex h-12 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap align-baseline"
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}
  >
    <Toggle
      label={m.published()}
      size="md"
      checked={imageCtx.activeImage?.isPublished ?? false}
      onChange={() => imageCtx.handlePublishToggle()}
      isSolid={false}
    />
  </div>
  <div
    class="flex h-12 cursor-pointer flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap pr-2 align-baseline transition-colors duration-200 hover:text-neutral-content active:text-primary"
    onclick={(e) => imageCtx.downloadImage(e, imageCtx.activeImage!)}
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}
  >
    <Icon class="h-6 w-6 stroke-[2px]" src={ArrowDownTray} />
  </div>
{/if}
