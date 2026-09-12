<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS
import { PanelRoot as Panel, ProfileSection } from '$lib/bits'
// ADAPTERS
import type { useProfilePanelModel } from '$lib/adapters/panels/useProfilePanelModel.svelte'
// COMPONENTS
import Header from '$lib/bits/patterns/panels/components/common/Header.svelte'
import ContributionStats from '$lib/bits/patterns/panels/sections/contributionStats/ContributionStatsSection.svelte'
import ContributedFeatures from '$lib/bits/patterns/panels/sections/contributedFeatures/ContributedFeaturesSection.svelte'
import ContributedImages from '$lib/bits/patterns/panels/sections/contributedImages/ContributedImagesSection.svelte'
import ContributedReports from '$lib/bits/patterns/panels/sections/contributedReports/ContributedReportsSection.svelte'
import LinkedAccounts from '$lib/bits/patterns/panels/sections/linkedAccounts/LinkedAccountsSection.svelte'
// AUTH

// CONTEXT

// ENUMS
import { Panel as PanelEnum, PanelSide } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'
import type { usePanelShellModel } from '$lib/adapters/panels/usePanelShellModel.svelte'

// CONTEXT

// STATE
let {
  model,
  shell,
  panelContainer = $bindable(),
}: {
  model: ReturnType<typeof useProfilePanelModel>
  shell: ReturnType<typeof usePanelShellModel>
  panelContainer?: HTMLDivElement
} = $props()
let isGuestUpgradeOpen = $state(false)
let guestAuthMode = $state<'create' | 'sign-in'>('create')

const panelProps = $derived(shell.panel)

// Profile loading and account state are owned by the route adapter.
const username = $derived(model.username)
const userData = $derived(model.userData)
const isOwnProfile = $derived(model.isOwnProfile)
const isGuestAccount = $derived(model.isGuestAccount)
</script>

{#if username}
  <Panel isOpen={shell.open} bind:panelContainer {...panelProps}>
    <Header onClose={shell.onClose} title={m.navbar__profile()} {...panelProps} />

    <ProfileSection
      {...model.profileProps}
      onUpgrade={() => {
        guestAuthMode = 'create'
        isGuestUpgradeOpen = true
      }}
      onSignIn={() => {
        guestAuthMode = 'sign-in'
        isGuestUpgradeOpen = true
      }}
    />
    {#if isOwnProfile && isGuestAccount && isGuestUpgradeOpen}
      <div transition:slide={{ duration: 220 }}>
        <LinkedAccounts isGuest startGuestUpgradeOpen {guestAuthMode} />
      </div>
    {/if}
    {#if userData}
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {#if isOwnProfile}
          <LinkedAccounts accountUsername={model.accountUsername} />
        {/if}
        <ContributionStats {userData} />
        <ContributedFeatures {userData} />
        <ContributedImages {userData} />
        <ContributedReports {userData} />
      </div>
    {:else}
      <div class="flex h-[calc(100vh-206px)] flex-col items-center justify-center">
        <div class="loading loading-ring loading-lg"></div>
      </div>
    {/if}
  </Panel>
{/if}
