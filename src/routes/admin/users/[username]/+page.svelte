<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// API
import { applyAdminProfileSave } from '#lib/users/adminMessagingDraft.js'
import { getAdminUserProfile } from '#lib/api/user.remote.js'
// ADAPTERS
import { createUserContributionsModel } from '#lib/adapters/panels/userContributions.js'
// BITS
import AdminUserProfileEditor from '#lib/bits/patterns/userDirectory/AdminUserProfileEditor.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
// ICONS
// TYPES
import type { AdminUserProfile as ProfileData } from '#lib/db/zod/schema/user.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. CONTEXT AND STATE
// 2. PROFILE LOADING
// 3. HEADER AND VIEW
// ═══════════════════════

const adminCtx = getAdminCtx()
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
</script>

<svelte:head
  ><title>
    {profile?.profile.displayUsername ?? page.params.username}
    · Users · HYPE
  </title></svelte:head
>

<Main.Root
  onDimensionsChange={(width, height) =>
    adminCtx.view.layout.setMainDimensions(width, height)}
>
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
  {:else}
    {#key profile.profile.id}
      <AdminUserProfileEditor
        data={profile}
        superAdmin={adminCtx.view.isSuperAdmin()}
        onsaved={result => {
          if (profile) profile = applyAdminProfileSave(profile, result)
        }}
        model={contributions}
      />
    {/key}
  {/if}
</Main.Root>
