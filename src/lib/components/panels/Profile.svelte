<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { PanelRoot as Panel, ProfileSection } from '$lib/bits'
// ADAPTERS
import { useProfileSectionModel } from '$lib/adapters/panels'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
import ContributionStats from '$lib/components/panels/sections/ContributionStats.svelte'
import ContributedFeatures from '$lib/components/panels/sections/ContributedFeatures.svelte'
import ContributedImages from '$lib/components/panels/sections/ContributedImages.svelte'
import ContributedReports from '$lib/components/panels/sections/ContributedReports.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { Panel as PanelEnum, PanelSide } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()

// STATE
let { panelContainer = $bindable() }: { panelContainer?: HTMLDivElement } = $props()

let panelProps: PanelProps = $derived({
  panelType: PanelEnum.profile,
  position: PanelSide.right,
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: appCtx.isAdmin(),
})

// Get the username from URL parameters
let username = $derived(appCtx.state.panels.profile.ctx?.username)
let userData = $derived(appCtx.state.panels.profile.ctx?.userData)
const profileSectionModel = useProfileSectionModel(appCtx, () => ({
  hideActions: true,
  hideEditableFields: true,
}))
</script>

{#if username}
  <Panel bind:panelContainer {...panelProps}>
    <Header title={m.navbar__profile()} {...panelProps} />

    <ProfileSection {...profileSectionModel.getProfileProps()} />
    {#if userData}
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
