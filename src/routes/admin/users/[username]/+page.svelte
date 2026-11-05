<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import { getAdminUserProfile } from '#lib/api/user.remote.js'
// ADAPTERS
import { createUserContributionsModel } from '#lib/adapters/panels/userContributions.js'
// BITS
import UserMessagingSettings from '#lib/bits/patterns/messaging/UserMessagingSettings.svelte'
import AdminUserProfile from '#lib/bits/patterns/userDirectory/AdminUserProfile.svelte'
import UserAccess from '#lib/bits/patterns/userDirectory/UserAccess.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// ICONS
import AccessIcon from 'virtual:icons/proicons/shield-checkmark'
import PersonIcon from 'virtual:icons/proicons/person'
// TYPES
import type { AdminUserProfile as ProfileData } from '#lib/db/zod/schema/user.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. CONTEXT AND STATE
// 2. PROFILE LOADING
// 3. HEADER AND VIEW
// ═══════════════════════

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setResourceType(false)
let profile = $state<ProfileData | null>(null)
let loading = $state(true)
let failed = $state(false)
let reload = $state(0)
let activeFacet = $state('profile')
const facets = new Map([
  ['profile', { label: 'Profile', icon: PersonIcon }],
  ['access', { label: 'Access', icon: AccessIcon }],
])
const contributions = createUserContributionsModel(adminCtx.view, {
  onContributedFeature: featureId =>
    goto(`/admin/features/${encodeURIComponent(featureId)}`),
  onContributedImage: (featureId, _projectId, imageId) =>
    goto(
      `/admin/features/${encodeURIComponent(featureId)}?imageId=${encodeURIComponent(imageId)}`,
    ),
})

// A navigation to another username invalidates every pending response from the old one.
$effect(() => {
  const username = page.params.username ?? ''
  void reload
  let active = true
  profile = null
  loading = true
  failed = false
  untrack(() => {
    void getAdminUserProfile({ username })
      .then(result => {
        if (active) profile = result
      })
      .catch(() => {
        if (active) failed = true
      })
      .finally(() => {
        if (active) loading = false
      })
  })
  return () => {
    active = false
  }
})

$effect(() => {
  headerCtrl.setHeaderForEntity(
    profile?.profile.displayUsername ?? page.params.username ?? 'User',
    PersonIcon,
    facets,
  )
  headerCtrl.setSearch(null)
  headerCtrl.clearControlBar()
  headerCtrl.clearFooter()
})
$effect(() => {
  headerCtrl.setFacets(facets, {
    active: activeFacet,
    onFacetChange: facet => {
      activeFacet = facet
    },
  })
})
</script>

<svelte:head
  ><title>
    {profile?.profile.displayUsername ?? page.params.username}
    · Users · HYPE
  </title></svelte:head
>

<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6" aria-busy={loading}>
  {#if loading}
    <p role="status" class="text-muted-foreground p-6">Loading profile…</p>
  {:else if failed}
    <div role="alert" class="border-border bg-panel rounded-xl border p-6">
      <p>Unable to load this profile.</p>
      <button
        type="button"
        class="border-border mt-4 rounded-lg border px-4 py-2"
        onclick={() => reload++}
      >
        Try again
      </button>
    </div>
  {:else if !profile}
    <p role="status" class="border-border bg-panel rounded-xl border p-6">
      User not found.
    </p>
  {:else if activeFacet === 'access'}
    <div class="bits-theme">
      <FormSurface><UserAccess access={profile.access} /></FormSurface>
    </div>
  {:else}
    <AdminUserProfile data={profile} model={contributions} />
    {#if adminCtx.view.isSuperAdmin()}
      {#key profile.profile.id}
        <div class="mt-5">
          <UserMessagingSettings userId={profile.profile.id} canVerify />
        </div>
      {/key}
    {/if}
  {/if}
</div>
