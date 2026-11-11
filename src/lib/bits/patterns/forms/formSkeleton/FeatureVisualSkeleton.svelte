<script lang="ts">
// COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'

let {
  expandedHeight = 520,
  showImage = true,
  showControls = true,
}: {
  expandedHeight?: number
  showImage?: boolean
  showControls?: boolean
} = $props()
</script>

<!-- Use the real pane and control positioning without mounting maps or fetching media. -->
<div aria-hidden="true" inert class="shrink-0">
  <Main.VisualSection
    {expandedHeight}
    {showImage}
    {showControls}
    class="border-x-0! border-t-0!"
  >
    {#snippet leftControls()}
      <div
        class="bg-panel border-border flex h-12 items-center gap-3 rounded-full border px-3"
      >
        <span
          class="bg-foreground/10 size-9 rounded-full motion-safe:animate-pulse"
        ></span>
        <span
          class="bg-foreground/10 hidden h-4 w-24 rounded motion-safe:animate-pulse min-[901px]:block"
        ></span>
      </div>
    {/snippet}
    {#snippet centerControls()}
      <div
        class="bg-panel border-border flex min-h-11 items-center gap-2 rounded-full border px-3 py-1"
      >
        {#each Array(4) as _}
          <span
            class="bg-foreground/10 h-10 w-6 rounded motion-safe:animate-pulse min-[901px]:w-10"
          ></span>
        {/each}
      </div>
    {/snippet}
    {#snippet rightControls()}
      <div
        class="bg-panel border-border flex min-h-11 items-center gap-2 rounded-full border px-3 py-1"
      >
        {#each Array(2) as _}
          <span
            class="bg-foreground/10 h-10 w-6 rounded motion-safe:animate-pulse"
          ></span>
        {/each}
      </div>
    {/snippet}
    {#snippet map()}
      <Main.VisualSectionMap>
        <div
          data-loading-map
          class="bg-foreground/5 border-border relative h-full w-full border-r"
        >
          <div class="absolute right-3 bottom-4 flex flex-col gap-2">
            {#each Array(3) as _}
              <span
                class="bg-foreground/10 size-9 rounded motion-safe:animate-pulse"
              ></span>
            {/each}
          </div>
        </div>
      </Main.VisualSectionMap>
    {/snippet}
    {#snippet image()}
      <div
        data-loading-image
        class="bg-foreground/10 h-full w-full motion-safe:animate-pulse"
      ></div>
    {/snippet}
  </Main.VisualSection>
</div>
