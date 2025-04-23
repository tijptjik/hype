<script lang="ts">
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Viewer from '$lib/components/common/Viewer.svelte';
// TYPES
import type { SectionProps, GetImageAPI } from '$lib/types';

let sectionProps: SectionProps & { image: GetImageAPI | null } = $props();
</script>

<div
  class="from-rose-500/70 to-fuchsia-800/70 relative z-10 flex h-[calc(100vh-196px)] w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-r p-0">
  <Header {...sectionProps} />
  <main class="relative w-full flex-grow overflow-hidden rounded-b-2xl bg-base-300">
    <div class="absolute inset-0 h-full w-full flex-none">
      <Viewer {...sectionProps} enableDropzone={true} enableReplacement={true} />
    </div>
  </main>
</div>
