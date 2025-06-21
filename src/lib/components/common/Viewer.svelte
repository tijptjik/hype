<script lang="ts">
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
// COMPONENTS
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Camera, Photo, InformationCircle } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
import Metadata from '$lib/components/common/ImageMetadata.svelte';
import DownloadImageButton from '$lib/components/images/DownloadImageButton.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import IconAnchor from '$lib/components/common/IconAnchor.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { Snippet } from 'svelte';
import type { Image } from '$lib/types';

type Props = {
  LeftActions?: Snippet;
  MiddleActions?: Snippet;
  RightActions?: Snippet;
  isDropzone?: boolean;
  enableReplacement?: boolean;
  isCrossfade?: boolean;
  hideActions?: boolean;
};

// STATE : PROPS
let {
  LeftActions,
  MiddleActions,
  RightActions,
  isDropzone = false,
  isCrossfade = true,
  hideActions = false
}: Props = $props();

// STATE : CONTEXT :: ROUTER
const imageCtx = getImageContext();
const adminCtx = getAdminCtx();

let image = $derived(imageCtx.activeImage);
let isEmpty = $derived(imageCtx.viewerState == 'empty');
let isError = $derived(imageCtx.viewerState == 'error');

// HANDLERS :: FILE DROP
const handleDrop = async (e: CustomEvent) => {
  if (!isDropzone) return;
  imageCtx.handleFilesSelect(
    e.detail.acceptedFiles,
    e.detail.fileRejections,
    {
      onSuccess: () => {
        if (adminCtx.activeResourceType) {
          adminCtx.invalidateAndRefresh(adminCtx.activeResourceType);
        }
      },
      onError: () => {
        console.error('[Viewer] Upload error');
      }
    },
    imageCtx.activeImage as Image
  );
};
</script>

{#snippet EmptyContent()}
  {#if isDropzone}
    <div class="flex h-full flex-col items-center justify-center">
      <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
      <span class="mx-auto pb-6 text-sm">{m.born_plain_bulldog_stop()}</span>
    </div>
  {/if}
{/snippet}

{#snippet ErrorContent()}
  <div class="flex h-full flex-col items-center justify-center gap-2 text-error">
    <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
    <span class="mx-auto pb-6 text-sm">{m.stale_quick_fireant_enchant()}</span>
  </div>
{/snippet}

{#snippet PhotoFrameWithActions()}
  {#if isEmpty}
    {@render EmptyContent()}
  {:else if isError}
    {@render ErrorContent()}
  {:else}
    <PhotoFrame class="h-full w-full rounded-2xl" mode="standalone" layout="contain">
      {#snippet children()}
        {#if image && !hideActions}
          <!-- Left Actions -->
          <div
            class="absolute bottom-0 left-0 z-30 m-10 flex flex-row items-start gap-4 overflow-visible">
            {#if LeftActions}
              {@render LeftActions()}
            {:else}
              <IconAnchor position="left" icon={Camera}>
                <Metadata {image} />
              </IconAnchor>
            {/if}
          </div>

          <!-- Middle Actions -->
          {#if MiddleActions}
            <div
              class="absolute bottom-0 left-0 z-30 m-10 flex flex-row items-center gap-4 overflow-visible">
              {@render MiddleActions()}
            </div>
          {/if}

          <!-- Right Actions -->
          <div
            class="absolute bottom-0 right-0 z-30 m-10 flex flex-row items-end gap-4 overflow-visible">
            {#if RightActions}
              {@render RightActions()}
            {:else}
              <IconAnchor position="right" icon={InformationCircle} class="mr-4">
                <UserAttributionCard
                  userId={image.contributorId}
                  date={image.createdAt || undefined}
                  type="imageContributor" />
              </IconAnchor>
              <DownloadImageButton {image} />
            {/if}
          </div>
        {/if}
      {/snippet}
    </PhotoFrame>
  {/if}
{/snippet}

<div
  class="relative flex h-full w-full flex-col {isDropzone ? 'group' : ''}"
  style="transition: outline-color 150ms ease-out"
  in:fade={{ duration: 300, delay: 50 }}>
  {#if isDropzone}
    <Dropzone
      accept={['image/*']}
      on:drop={handleDrop}
      on:select={handleDrop}
      multiple={false}
      class="group flex h-full w-full flex-col justify-center gap-2 rounded-xl bg-neutral text-center align-middle transition-colors"
      disableDefaultStyles={true}>
      <div
        class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 rounded-xl border-4 border-dashed border-transparent transition-colors delay-500 group-hover:border-primary">
      </div>
      {@render PhotoFrameWithActions()}
    </Dropzone>
  {:else}
    {@render PhotoFrameWithActions()}
  {/if}
</div>
