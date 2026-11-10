<script lang="ts">
// COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
</script>
<div
  class="bg-panel flex h-full min-h-0 flex-col"
  role="status"
  aria-busy="true"
  aria-label="Loading share settings"
>
  <header class="border-border shrink-0 border-b p-5">
    <h1 class="text-xl font-semibold">Share · Embed map</h1>
    <p class="mt-1 text-sm opacity-75">
      Choose public resources, set the starting view, and copy your embed.
    </p>
  </header>
  <div
    class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]"
  >
    <ContentSkeleton class="border-border border-r p-5"
      ><h2 class="mb-3 font-semibold">Content</h2>
      <input class="mb-3 w-full rounded border p-2" value="Search resources" disabled>
      {#each ['Hub', 'Organisation', 'Project', 'Layer'] as name}
        <div class="mb-3 rounded border p-3">
          <p>{name}</p>
          <p class="mt-1 text-sm">Resource name</p>
        </div>
      {/each}</ContentSkeleton
    >
    <Skeleton class="h-full min-h-64 w-full rounded-none" />
  </div>
</div>
