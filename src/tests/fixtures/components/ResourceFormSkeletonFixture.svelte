<script lang="ts">
// COMPONENTS
import ResourceFormSkeleton from '#lib/bits/patterns/forms/formSkeleton/ResourceFormSkeleton.svelte'
import UserProfileSkeleton from '#lib/bits/patterns/userDirectory/UserProfileSkeleton.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
const params = new URLSearchParams(window.location.search)
const resource = (params.get('resource') ?? 'hub') as
  | 'hub'
  | 'organisation'
  | 'project'
  | 'layer'
  | 'user'
const facet = params.get('facet') ?? 'core'
</script>
<div class="bits-theme flex min-h-screen flex-col">
  {#if resource === 'user'}
    <UserProfileSkeleton />
  {:else}
    <ResourceFormSkeleton {resource} {facet} locales={['en', 'zhHant', 'zhHans']} />
  {/if}
</div>
