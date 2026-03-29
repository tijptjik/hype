<script lang="ts">
import { fade } from 'svelte/transition'

const OVERLAY_FADE_OUT_MS = 220
</script>

<div
  transition:fade={{ duration: OVERLAY_FADE_OUT_MS }}
  class="pointer-events-none absolute inset-0 z-40 rounded-[inherit] bg-black/20 backdrop-blur-[2px]"
>
  <div class="gallery-upload-shimmer absolute inset-0"></div>
</div>

<style>
.gallery-upload-shimmer {
  background: linear-gradient(
    115deg,
    transparent 0%,
    rgba(255, 255, 255, 0.05) 35%,
    rgba(255, 255, 255, 0.22) 50%,
    rgba(255, 255, 255, 0.05) 65%,
    transparent 100%
  );
  background-size: 220% 100%;
  animation: gallery-upload-shimmer 1.4s linear infinite;
}

@keyframes gallery-upload-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -40% 0;
  }
}
</style>
