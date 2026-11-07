<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { FormFeatureVisualSection } from '#lib/bits/custom/form/src/formFeatureVisualSection/index.js'
// TYPES
import type { Snippet } from 'svelte'

let {
  photoOnly = false,
  loading = false,
  type,
  contributorId,
  createdAt,
  map: mapContent,
  image: imageContent,
  details,
  class: className = '',
}: {
  photoOnly?: boolean
  loading?: boolean
  type?: string
  contributorId?: string | null
  createdAt?: string | null
  map: Snippet
  image: Snippet
  details?: Snippet
  class?: string
} = $props()
let viewportHeight = $state(900)
let viewportWidth = $state(1400)
let collapsed = $state(false)
</script>

<svelte:window bind:innerHeight={viewportHeight} bind:innerWidth={viewportWidth} />
<div
  data-form-surface
  data-task-workspace
  data-task-loading={loading ? (type ?? 'unknown') : undefined}
  aria-busy={loading}
  class={`bg-panel text-foreground @container/task flex h-full min-h-0 w-full flex-col overflow-y-auto ${className}`}
>
  {#if loading}
    <span role="status" class="sr-only">{m.resource_loading()}</span>
  {/if}
  {#if photoOnly}
    <div data-task-image-pane class="relative min-h-80 flex-1">
      {@render imageContent()}
    </div>
  {:else}
    <!-- The same resizable split remains mounted through task, map and gallery loading. -->
    <FormFeatureVisualSection
      class={String.raw`${collapsed ? 'shrink-0' : 'min-[901px]:flex-1'} [&_.bits-feature-visual\_\_map]:p-0! [&_.bits-feature-visual\_\_image]:p-0! max-[900px]:[&_.bits-feature-visual\_\_body]:h-auto! max-[900px]:[&_.bits-feature-visual\_\_image]:flex-none!`}
      expandedHeight={Math.min(
        1200,
        viewportHeight * (viewportWidth <= 900 ? 0.4 : 0.65),
      )}
      minimumHeight={160}
      isCollapsed={collapsed}
      isEditing={false}
      splitResizeLabel={m.feature_visual_resize()}
      showCenterControls={false}
      showNavigationControls={false}
      {contributorId}
      {createdAt}
      onCollapse={() => (collapsed = true)}
      onExpand={() => (collapsed = false)}
    >
      {#snippet map()}
        <div data-task-map-pane class="flex h-full min-h-0 w-full flex-col">
          {@render mapContent()}
        </div>
      {/snippet}
      {#snippet image()}
        <div
          data-task-image-pane
          class="relative flex h-[var(--bits-feature-visual-expanded-height)] min-h-0 w-full flex-col overflow-hidden min-[901px]:h-full"
        >
          {@render imageContent()}
        </div>
      {/snippet}
    </FormFeatureVisualSection>
  {/if}
  {#if details}
    {@render details()}
  {/if}
</div>
