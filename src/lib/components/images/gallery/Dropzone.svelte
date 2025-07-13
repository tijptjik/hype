<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
// TYPES
import type { Image } from '$lib/types';

type Props = {
  updateScrollArrows: () => void;
  inputElement: HTMLInputElement | undefined;
};

// SERVICES
const imageCtx = getImageCtx();

let { updateScrollArrows, inputElement = $bindable() }: Props = $props();

const handleFiles = async (e: CustomEvent) => {
  await imageCtx.handleFilesSelect(e.detail.acceptedFiles, e.detail.fileRejections, {
    onSuccess: (savedImage: Image) => {
      updateScrollArrows();
    }
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
  <span class="mx-auto pb-6 text-sm">{m.dropzone__drop_images()}</span>
</Dropzone>
