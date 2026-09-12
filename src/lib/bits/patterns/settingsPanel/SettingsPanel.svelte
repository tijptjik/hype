<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { ThemePicker } from '$lib/bits/patterns/themePicker'

// I18N
import { m } from '$lib/i18n'
// BITS
import { PanelRoot as Panel, ProfileSection } from '$lib/bits'
// ADAPTERS
import type { useSettingsPanelModel } from '$lib/adapters/panels/useSettingsPanelModel.svelte'
// AUTH

// COMPONENTS
import Header from '$lib/bits/patterns/panels/components/common/Header.svelte'
import Info from '$lib/bits/patterns/panels/components/info/Settings.svelte'
import LinkedAccounts from '$lib/bits/patterns/panels/sections/linkedAccounts/LinkedAccountsSection.svelte'
import Language from '$lib/bits/patterns/panels/sections/language/LanguageSection.svelte'
import Contributor from '$lib/bits/patterns/panels/sections/contributor/ContributorSection.svelte'
import DefaultMap from '$lib/bits/patterns/panels/sections/defaultMap/DefaultMapSection.svelte'
import Experimental from '$lib/bits/patterns/panels/sections/experimental/ExperimentalSection.svelte'
import Admin from '$lib/bits/patterns/panels/sections/admin/AdminSection.svelte'
// CONTEXT

// ENUMS
import { Panel as PanelEnum, PanelSide } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'

// CONTEXT
let { model }: { model: ReturnType<typeof useSettingsPanelModel> } = $props()
const panelProps = $derived(model.panel)
const isGuestAccount = $derived(model.isGuestAccount)

// STATE
let isInfoOpen = $state(false)
let isGuestUpgradeOpen = $state(false)
let guestAuthMode = $state<'create' | 'sign-in'>('create')
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let handleToggleInfo = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation()
  isInfoOpen = !isInfoOpen
  if (isInfoOpen) {
    setTimeout(() => {
      panelContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 300)
  }
}
</script>

<Panel isOpen={model.open} bind:panelContainer {...panelProps}>
  <Header
    onClose={model.onClose}
    title={m.menu_settings()}
    onToggleInfo={e => {
      handleToggleInfo(e)
    }}
    {...panelProps}
  />
  <Info isOpen={isInfoOpen} />

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
  {#if isGuestAccount && isGuestUpgradeOpen}
    <div transition:slide={{ duration: 220 }}>
      <LinkedAccounts isGuest startGuestUpgradeOpen {guestAuthMode} />
    </div>
  {/if}
  <div class="flex flex-col">
    {#if panelProps.isAdmin}
      <div class="shrink-0">
        <Admin
          preferences={model.adminPreferences}
          onPreference={model.onAdminPreference}
          {...panelProps}
        />
      </div>
    {/if}
    <div class="shrink-0"><Language model={model.language} {...panelProps} /></div>
    <div class="shrink-0 border-b border-border p-4">
      <ThemePicker value={model.theme} onSelect={model.onTheme} />
    </div>
    {#if !panelProps.isAdmin}
      {#if !isGuestAccount}
        <div class="shrink-0">
          <Contributor
            attribution={model.attribution}
            onAttribution={model.onAttribution}
            {...panelProps}
          />
        </div>
      {/if}
      <div class="shrink-0">
        <DefaultMap model={model.defaultMap} {...panelProps} />
      </div>
      <div class="shrink-0">
        <Experimental model={model.experimental} {...panelProps} />
      </div>
    {/if}
  </div>
</Panel>
