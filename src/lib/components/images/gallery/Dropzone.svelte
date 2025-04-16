<script lang="ts">
// LIB
import {
  imageSets,
  selectActiveImage,
  handleFilesSelect
} from '$lib/images/index.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
// TYPES
import type { ImageUploadRefs as Refs, GetImageAPI } from '$lib/types';

type Props = {
  refs: Refs;
  updateScrollArrows: () => void;
  inputElement: HTMLInputElement | undefined;
};

let { refs, updateScrollArrows, inputElement = $bindable() }: Props = $props();

const handleFiles = async (e: CustomEvent) => {
  await handleFilesSelect(e, {
    refs,
    callback: (savedImage: GetImageAPI) => {
      // Optional: handle successful upload
      updateScrollArrows();
    },
    onError: () => {
      // Optional: handle error state
      console.error('Failed to upload one or more images');
    },
    isStandalone: false
  });
};
</script>

<Dropzone
  accept={['image/*']}
  on:drop={handleFiles}
  on:select={handleFiles}
  class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
  disableDefaultStyles={true}
  bind:inputElement>
  <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
  <span class="mx-auto pb-6 text-sm">Drop images</span>
</Dropzone>
