<script lang="ts">
// COMPONENTS
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// AUTH
import { useSession } from '$lib/auth/client'
import { canCreateEntity } from '$lib/client/services/auth'
// TYPES
import type { SessionUser } from '$lib/types'

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : AUTH
let session = useSession()
let user = $session.data?.user as SessionUser

// STATE : DERIVED
let resourceType = $derived(appCtx.headerResourceType)
let showNewButton = $derived(
  user && resourceType && canCreateEntity(user, resourceType),
)
</script>

{#if showNewButton}
  <NewEntityButton />
{/if}
