<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Resource } from '$lib/types';

let { resource, resourceParent = undefined } = $props<{
  resource: Resource;
  resourceParent?: Resource;
}>();

// CONTEXT
const appCtx = getAppCtx();
</script>

<div class="flex flex-col items-start gap-0">
  {#if resourceParent}
    <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
      <span class="text-primary"
        >{getI18n(resourceParent, 'nameShort', appCtx.getUserPreferences())}
      </span>
    </p>
  {/if}
  <p class="font-light">{getI18n(resource, 'name', appCtx.getUserPreferences())}</p>
</div>
