<script lang="ts">
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// COMPONENTS
import LocationMatcher from '#lib/bits/patterns/resource/locationMatcher/LocationMatcher.svelte'
const admin = getAdminCtx()
</script>
{#if admin.view.isSuperAdmin()}
  {#key admin.view.getRoleScopeQueryKey()}
    <LocationMatcher />
  {/key}
{:else}
  <p role="alert" class="p-6">
    The Location matcher is available to super admins only.
  </p>
{/if}
