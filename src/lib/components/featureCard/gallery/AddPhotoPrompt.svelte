<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
import { getImageCtx } from '$lib/context/image.svelte';
// SERVICES
import { checkCameraAvailability } from '$lib/client/services/image';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera } from '@steeze-ui/heroicons';
// ENUMS
import { FeatureCardMode } from '$lib/enums';

// CONTEXT
const cardCtx = getCardCtx();
const imageCtx = getImageCtx();

// STATE
let hasCameraAccess = $state(false);
// ELEMENTS
let galleryInput: HTMLInputElement;

// HANDLERS :: FILE INPUT
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const files = Array.from(input.files);
  imageCtx.handleStagedFilesSelect(files, []);

  // Reset input to allow selecting same files again
  input.value = '';
}
</script>

<!-- Hidden file inputs -->
<input
  bind:this={galleryInput}
  type="file"
  accept="image/*"
  multiple
  style="display: none"
  onchange={handleFileSelect} />

<div
  class="z-5 absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 bg-base-200/70 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0">
  <h1
    class="text-center text-2xl font-bold text-white/70 [text-shadow:_0_1px_2px_rgba(0,0,0,0.5)]">
    {m.filters__missing()}
    {m.true_equal_polecat_surge()}
  </h1>
  <p class="-white/70 [text-shadow:_0_1px_2px_rgba(0,0,0,0.5) max-w-[60%] text-center">
    {m.viewer__no_image_note()}
  </p>
  <button
    class="btn mt-4 bg-base-300 text-white"
    onclick={() => {
      checkCameraAvailability().then((hasCameraAccess) => {
        if (hasCameraAccess) {
          cardCtx.setMode(FeatureCardMode.AddPhoto);
        } else {
          galleryInput.click();
        }
      });
    }}>
    <Icon src={Camera} class="h-6 w-6" />
    {m.honest_fluffy_falcon_enjoy()}
  </button>
</div>
