<script lang="ts">
// SVELTE
import type { ComponentProps } from 'svelte'
// COMPONENTS
import LazyMaplet from './LazyMaplet.svelte'
// CONTEXT
import { getAdminMap } from '#lib/context/adminMap.svelte.js'

let props: ComponentProps<typeof LazyMaplet> = $props()
const owner = getAdminMap()

/** Connect the common route outlet without giving the page ownership of the renderer.
 * @param node Map outlet. @param value Current map inputs.
 * @returns Prop update and route teardown handlers.
 */
function attachMap(
  node: HTMLElement,
  value: ComponentProps<typeof LazyMaplet>,
): { update: (next: ComponentProps<typeof LazyMaplet>) => void; destroy: () => void } {
  owner?.attach(node, value)
  return {
    update(next): void {
      owner?.attach(node, next)
    },
    destroy(): void {
      owner?.release(node)
    },
  }
}
</script>

<div class="bits-feature-map" use:attachMap={{ ...props }} data-admin-map-outlet>
  {#if !owner}
    <LazyMaplet {...props} />
  {/if}
</div>
