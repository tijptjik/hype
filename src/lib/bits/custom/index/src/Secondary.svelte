<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'
// CONTEXT
import { getVirtualListRenderContext } from './virtualListContext'

let {
  children,
  fallback,
}: {
  children?: Snippet
  fallback?: Snippet
} = $props()

const renderContext = getVirtualListRenderContext()
const canRenderSecondary = $derived(renderContext?.canRenderSecondary ?? true)
let hasRenderedSecondary = $state(false)

$effect(() => {
  if (canRenderSecondary && !hasRenderedSecondary) {
    hasRenderedSecondary = true
  }
})
</script>

{#if hasRenderedSecondary || canRenderSecondary}
  {@render children?.()}
{:else if fallback}
  {@render fallback()}
{/if}
