<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import OmnibarSearchBar from '#lib/bits/patterns/bars/omnibar/components/OmnibarSearchBar.svelte'
// CONTEXT
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// LAYOUT
import { OMNIBAR_SEARCH_POLICY } from '#lib/bits/patterns/bars/omnibar/searchBudget.js'
// TYPES
import type { OmnibarResultSection } from '#lib/bits/patterns/bars/omnibar/omnibar.types.js'

const responsive = new ResponsiveCtx()
let action = $state('')
let expanded = $state(false)
let only = $state('')
let short = $state(false)

onMount(() => {
  const viewport = window.visualViewport
  const update = () => {
    responsive.setWindowDimensions(innerWidth, innerHeight)
    responsive.setViewportDimensions(
      viewport?.width ?? innerWidth,
      viewport?.height ?? innerHeight,
      viewport?.offsetTop ?? 0,
    )
  }
  update()
  window.addEventListener('resize', update)
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  return () => {
    window.removeEventListener('resize', update)
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
  }
})

const sections: OmnibarResultSection[] = $derived(
  OMNIBAR_SEARCH_POLICY.filter(policy => !only || policy.type === only).map(
    ({ type, limit }) => ({
      collectionType: type,
      limit: expanded ? 15 : limit,
      onLoadMore:
        type === 'feature'
          ? () => {
              only = 'feature'
              expanded = true
            }
          : undefined,
      onSelection: id => {
        action = `activate:${id}`
      },
      results: Array.from({ length: 15 }, (_, index) => ({
        ref: `${type}-${index}`,
        name: `Neon ${type} ${index}${short ? '' : ' with a long essential label that must wrap'}`,
        collectionType: type,
        count: 0,
        ...(!['layer', 'project', 'organisation'].includes(type)
          ? {}
          : {
              enabled: false,
              control: {
                kind: type === 'layer' ? ('target' as const) : ('filter' as const),
                label: `${type === 'layer' ? 'Isolate' : 'Filter'} ${type} ${index}`,
                onClick: () => {
                  action = `control:${type}-${index}`
                },
              },
            }),
      })),
    }),
  ),
)
</script>

<div class="mx-4 mt-4" style="--omni-available-height: 100dvh">
  <OmnibarSearchBar
    hasElevatedChrome={false}
    effectiveAppMainWidth={responsive.visibleWindowWidth}
    search={{
      term: 'neon',
      isTrayOpen: true,
      sections,
      expanded,
      viewport: {
        height: responsive.visibleWindowHeight,
        offsetTop: responsive.viewport.offsetTop,
      },
      onSearchTermChange: () => {},
      onOpenTray: () => {},
      onCloseTray: () => {},
      onSelectFirstResult: () => {},
      onClearSearchOrCloseTray: () => {},
      onCreateFeature: () => {},
    }}
  />
</div>
<div class="fixed bottom-0 flex gap-2">
  <button
    type="button"
    onclick={() => {
      only = ''
      expanded = false
    }}
  >
    Reset
  </button>
  <button
    type="button"
    onclick={() => {
      short = !short
    }}
  >
    Labels
  </button>
  {#each ['project', 'layer', 'organisation'] as type}
    <button
      type="button"
      onclick={() => {
        only = type
        expanded = false
      }}
    >
      {type}
      only
    </button>
  {/each}
  <output>{action}</output>
</div>
