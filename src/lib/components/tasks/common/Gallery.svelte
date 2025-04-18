<script lang="ts">
import Gallery from '$lib/components/images/gallery/Gallery.svelte';
</script>

<div
  class="relative m-4 min-w-0 overflow-hidden rounded-b-xl bg-base-100 px-3 py-2 @container">
  <!-- TODO: Flatten the image for task responses -->
  <Gallery hasDropzone={false} />
</div>
