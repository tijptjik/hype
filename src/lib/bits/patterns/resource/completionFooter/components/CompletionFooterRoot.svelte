<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { quadInOut } from 'svelte/easing'
import { slide } from 'svelte/transition'
// TYPES
import type { CompletionFooterRootProps } from '../completionFooter.types'

let { children }: CompletionFooterRootProps = $props()
let isVisible = $state(false)

onMount(() => {
  isVisible = true
})
</script>

{#if isVisible}
  <footer
    class="bits-theme bits-completion-footer"
    in:slide={{ duration: 300, axis: 'y', easing: quadInOut, delay: 100 }}
  >
    {#if children}
      {@render children()}
    {/if}
  </footer>
{/if}
