<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// TRANSITIONS
import { fade } from 'svelte/transition';
</script>

<div class="absolute inset-0 bg-base-300" transition:fade={{ duration: 50 }}>
  <div class="flex h-full items-center justify-center">
    <span class="text-xl text-base-content/20"
      >{m.error_message__failed_to_load_image()}</span>
  </div>
</div>
