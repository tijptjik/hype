<script lang="ts">
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';

// CONTEXT
const cardCtx = getFeatureCardContext();
</script>

{#if cardCtx.validationError}
  <div class="mt-2 text-sm font-medium text-error w-100:px-2">
    <span class="flex items-center gap-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"></path>
      </svg>
      {cardCtx.validationError}
    </span>
  </div>
{/if}
