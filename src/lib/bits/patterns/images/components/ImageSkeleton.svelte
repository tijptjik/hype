<script lang="ts">
// ICONS
import PhotoIcon from 'virtual:icons/proicons/photo'
</script>

<div
  aria-hidden="true"
  data-image-skeleton
  class="pointer-events-none absolute inset-0 overflow-hidden bg-base-200"
>
  <div class="absolute inset-0 bg-linear-to-br from-foreground/5 via-foreground/10 to-foreground/5 motion-safe:animate-pulse motion-reduce:animate-none"></div>
  <div class="absolute inset-0 flex items-center justify-center text-foreground/20">
    <PhotoIcon class="h-[28%] max-h-16 w-[28%] max-w-16" />
  </div>
</div>
