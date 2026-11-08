<script lang="ts">
// COMPONENTS
import FeatureCardRoot from './components/FeatureCardRoot.svelte'
import Viewer from '#lib/bits/patterns/images/components/Viewer.svelte'
// TYPES
import type { ViewerRenderable } from '#lib/bits/patterns/images/images.types.js'

let {
  state,
  items,
  loading = false,
}: {
  state: 'merged' | 'split'
  items: { id: string; title: string; images: ViewerRenderable[] }[]
  loading?: boolean
} = $props()
</script>

<FeatureCardRoot>
  <section
    aria-label="Feature successors"
    aria-busy={loading}
    class="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-y-auto bg-(--theme-panel)"
  >
    <div
      class="bg-border grid min-h-56 flex-1 grid-cols-2 gap-px overflow-hidden rounded-t-2xl sm:min-h-72"
    >
      {#each items as item (item.id)}
        <section
          class="relative min-h-56 min-w-0 bg-(--theme-panel) sm:min-h-72"
          aria-label={`${item.title} photos`}
        >
          <Viewer items={item.images} centerAction="fullscreen" railPadding={2} />
        </section>
      {/each}
    </div>
    <div class="shrink-0 space-y-4 px-4 pt-5 pb-24 sm:px-6 sm:py-6">
      <div class="space-y-2">
        <p class="text-primary text-xs font-medium tracking-widest uppercase">
          {state === 'split' ? 'Feature split' : 'Features merged'}
        </p>
        <h1 class="text-xl font-semibold sm:text-2xl">
          {state === 'split' ? 'Two from One' : 'This Feature has moved'}
        </h1>
        <p class="text-base-content/70 text-sm leading-relaxed">
          {state === 'split'
            ? 'This Feature was split and now lives on as these two:'
            : 'This Feature was merged. Continue to its current Features below.'}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        {#each items as item (item.id)}
          <a
            href={`/features/${encodeURIComponent(item.id)}`}
            class="border-primary/25 bg-primary/5 text-base-content hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-primary grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4"
          >
            <span class="min-w-0 break-words whitespace-normal">{item.title}</span>
            <span aria-hidden="true">↗</span>
          </a>
        {/each}
      </div>
    </div>
  </section>
</FeatureCardRoot>
