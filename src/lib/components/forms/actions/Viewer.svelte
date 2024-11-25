<script lang="ts">
// COMPONENTS
import { ArrowDownTray } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import Toggle from '$lib/components/forms/fields/Toggle.svelte';
// TYPES
import type { GetImageAPI } from '$lib/types';

type Props = {
  activeImage: GetImageAPI | null;
};

// STATE :: PROPS
let { activeImage = $bindable(null) }: Props = $props();

// HANDLERS :: PUBLISH TOGGLE
const handlePublishToggle = async () => {
  if (!activeImage) return;

  try {
    const response = await fetch(`/api/images/${activeImage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        featureImage: {
          isPublished: !activeImage.isPublished
        }
      })
    });

    if (!response.ok) throw new Error('Failed to update publication state');

    const result = await response.json();
    if (result?.success) {
      activeImage.isPublished = !activeImage.isPublished;
    }
  } catch (err) {
    console.error('Failed to toggle publication:', err);
  }
}

// HANDLERS :: DOWNLOAD IMAGE
const handleDownload = () => {
  if (!activeImage) return;
  let downloadUrl = '';

  if (activeImage.cdn.toLowerCase() === 'cloudinary') {
    downloadUrl = `https://res.cloudinary.com/${activeImage.env}/image/upload/fl_attachment/${activeImage.publicId}`;
  } else {
    throw new Error('Unsupported CDN');
  }

  fetch(downloadUrl)
    .then((res) => {
      const contentType = res.headers.get('content-type');
      const extension = contentType ? `.${contentType.split('/')[1]}` : '';
      const filename = `${activeImage.publicId.split('/').pop()}${extension}`;
      return { blob: res.blob(), filename };
    })
    .then(({ blob, filename }) => blob.then((b) => ({ blob: b, filename })))
    .then(({ blob, filename }) => downloadBlobToFile(blob, filename))
    .catch((err) => {
      console.error('Failed to download image:', err);
    });
}

// UTILS
const downloadBlobToFile = async (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href); // Clean up the blob URL
};
</script>

<div class="flex flex-row items-center justify-between gap-2 align-baseline">
  <div class="text-sm font-light">Published</div>
  <Toggle
    size="sm"
    checked={activeImage?.isPublished ?? false}
    onChange={handlePublishToggle} />
</div>

<div
  class="flex cursor-pointer flex-row items-center justify-between gap-2 align-baseline transition-colors duration-200 hover:text-neutral-content active:text-primary"
  onclick={handleDownload}>
  <Icon src={ArrowDownTray} onClick={handleDownload} />
</div>
