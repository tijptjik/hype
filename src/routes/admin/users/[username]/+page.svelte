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
import AdminUserProfile from '#lib/bits/patterns/userDirectory/AdminUserProfile.svelte'
// ICONS
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
  headerCtrl.setHeaderForIndex(
    profile?.profile.displayUsername ?? page.params.username ?? 'User',
    PersonIcon,
    {
      showNew: false,
      showFilter: false,
      showViewActions: false,
      showLayoutToggle: false,
      showControlBarToggle: false,
    },
  )
  headerCtrl.setSearch(null)
  headerCtrl.clearControlBar()
  headerCtrl.clearFooter()
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
    <p role="status" class="p-6 text-muted-foreground">Loading profile…</p>
  {:else if failed}
    <div role="alert" class="rounded-xl border border-border bg-panel p-6">
      <p>Unable to load this profile.</p>
      <button
        type="button"
        class="mt-4 rounded-lg border border-border px-4 py-2"
        onclick={() => reload++}
      >
        Try again
      </button>
    </div>
  {:else if !profile}
    <p role="status" class="rounded-xl border border-border bg-panel p-6">
      User not found.
    </p>
  {:else}
    <AdminUserProfile data={profile} model={contributions} />
  {/if}
</div>
