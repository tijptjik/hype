<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

// PROPS
let { userData }: { userData?: UserProfile } = $props()

// DERIVED STATE
let reportCount = $derived(userData?.reportedMissingCount ?? 0)
let isLoading = $derived(!userData)
</script>

<div id="contributed-reports" class="border-b border-border">
  <h3
    class="px-6 pt-5 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
