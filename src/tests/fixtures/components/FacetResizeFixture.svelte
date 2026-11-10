<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Facet from '#lib/bits/custom/main/Facet.svelte'

setResponsiveCtx()
let narrow = $state(false)
let active = $state(0)
let compact = $state(false)
</script>

<button type="button" onclick={() => (narrow = !narrow)}>Toggle sidebar</button>
<button type="button" onclick={() => (active = 1 - active)}>Switch facet</button>
<button type="button" onclick={() => (compact = !compact)}>Toggle content</button>
<div class="flex h-[600px]">
  <aside
    style:width={narrow ? '64px' : '320px'}
    class="shrink-0 transition-[width] duration-500"
  ></aside>
  <main class="relative min-w-0 flex-1">
    {#each [0, 1] as index}
      <Facet
        isVisible={active === index}
        transition="fade"
        extraScroll={320}
        fillHeight
        previousAction={{ text: 'Previous tab', onClick: () => {} }}
        attrs={{ 'data-facet-id': String(index) }}
      >
        <div>
          {#each Array(compact ? 2 : 60) as _, row}
            <p class="p-3">
              Row {row}: Location policy content which wraps as the available width
              changes. Names and settings remain visible throughout resizing.
            </p>
          {/each}
        </div>
      </Facet>
    {/each}
  </main>
</div>
