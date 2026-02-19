<script lang="ts">
/**
 * @component Wrapper for staging action components with absolute positioning
 * @param {Image} currentImage - The currently displayed image
 * @param {boolean} hasCameraAccess - Whether camera access is available
 */
// SERVICES
import { checkCameraAvailability } from '$lib/client/services/image'
// COMPONENTS
import AddFromCamera from './AddFromCamera.svelte'
import AddFromFiles from './AddFromFiles.svelte'
import Remove from '$lib/components/featureCard/gallery/Remove.svelte'

// TYPES
import type { Image } from '$lib/types'

// STATE
let hasCameraAccess = $state(false)

// PROPS
let { currentImage }: { currentImage: Image } = $props()

$effect(() => {
  checkCameraAvailability().then(cameraAvailable => {
    hasCameraAccess = cameraAvailable
  })
})
</script>

<div class="absolute bottom-2 left-2 z-10 flex flex-row gap-2">
  <Remove {currentImage} />
  {#if hasCameraAccess}
    <AddFromCamera {currentImage} />
  {/if}
  <AddFromFiles {currentImage} />
</div>
