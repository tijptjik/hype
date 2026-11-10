<script lang="ts" generics="Module">
// SVELTE
import { onMount, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'

let {
  load,
  children,
  pending: pendingContent,
}: {
  load: () => Promise<Module>
  children: Snippet<[Module]>
  pending: Snippet
} = $props()
let pending = $state<Promise<Module> | null>(null)

// Optional sections load only when their existing facet boundary mounts them.
onMount(() => {
  pending = load()
})
</script>

{#if pending}
  {#await pending}
    {@render pendingContent()}
  {:then module}
    {@render children(module)}
  {:catch}
    <button
      type="button"
      class="rounded px-4 py-2 text-sm"
      onclick={() => {
        pending = load()
      }}
    >
      {m.bootstrap__retry()}
    </button>
  {/await}
{:else}
  {@render pendingContent()}
{/if}
