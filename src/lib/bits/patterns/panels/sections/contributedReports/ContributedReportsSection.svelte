<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import type { UserProfile } from '$lib/db/zod/schema/user.types'

// PROPS
let { userData }: { userData?: UserProfile } = $props()

// DERIVED STATE
let reportCount = $derived(userData?.reportedMissingCount ?? 0)
let isLoading = $derived(!userData)
</script>

<div id="contributed-reports" class="border-b border-base-300">
  <h3
    class="p-4 pb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60"
  >
    {m.brief_aqua_piranha_grow()}
  </h3>

  {#if isLoading}
    <div
      class="flex items-center justify-center p-4"
      in:fade={{ duration: 300, delay: 300 }}
    >
      <div class="loading loading-ring loading-sm text-primary"></div>
    </div>
  {:else if reportCount === 0}
    <div class="flex items-center justify-center p-4 text-base-content/60">
      <span class="text-sm">{m.light_antsy_lemur_pinch()}</span>
    </div>
  {/if}
</div>
