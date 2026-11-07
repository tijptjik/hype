<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import Theme from '#lib/bits/patterns/panels/sections/theme/ThemeSection.svelte'

// I18N
import { m } from '#lib/i18n.js'
// BITS
import Panel from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
import ProfileSection from '#lib/bits/patterns/panels/sections/ProfileSection.svelte'
// ADAPTERS
import type { SettingsPanelModel } from './settingsPanel.types'
// AUTH

// COMPONENTS
import {
  setSectionReveal,
  revealPanelSection,
} from '#lib/bits/patterns/panels/sectionReveal.js'
import Header from '#lib/bits/patterns/panels/components/common/Header.svelte'
import Info from '#lib/bits/patterns/panels/components/info/Settings.svelte'
import LinkedAccounts from '#lib/bits/patterns/panels/sections/linkedAccounts/LinkedAccountsSection.svelte'
import Language from '#lib/bits/patterns/panels/sections/language/LanguageSection.svelte'
import Contributor from '#lib/bits/patterns/panels/sections/contributor/ContributorSection.svelte'
import DefaultMap from '#lib/bits/patterns/panels/sections/defaultMap/DefaultMapSection.svelte'
import Experimental from '#lib/bits/patterns/panels/sections/experimental/ExperimentalSection.svelte'
import Admin from '#lib/bits/patterns/panels/sections/admin/AdminSection.svelte'
// CONTEXT

// ENUMS
import { Panel as PanelEnum, PanelSide } from '#lib/enums.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

// CONTEXT
let { model }: { model: SettingsPanelModel } = $props()
const panelProps = $derived(model.panel)
const fullModel = $derived('mode' in model ? null : model)
const isGuestAccount = $derived(fullModel?.isGuestAccount ?? false)

// STATE
let isInfoOpen = $state(false)
let isGuestUpgradeOpen = $state(false)
let guestAuthMode = $state<'create' | 'sign-in'>('create')
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

// Only this panel opts into revealing user-expanded sections after their slide finishes.
setSectionReveal(section => {
  revealPanelSection(panelContainer, section, prefersReducedMotion.current)
})

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

<Panel isOpen={model.open} bind:panelContainer preserveContentWidth {...panelProps}>
  <Header
    onClose={model.onClose}
    title={m.menu_settings()}
    onToggleInfo={fullModel ? handleToggleInfo : undefined}
    {...panelProps}
  />
  <Info isOpen={isInfoOpen} />

  {#if fullModel}
    <ProfileSection
      {...fullModel.profileProps}
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
  {/if}
  <div class="flex flex-col">
    {#if fullModel && panelProps.isAdmin}
      <div class="shrink-0">
        <Admin
          preferences={fullModel.adminPreferences}
          onPreference={fullModel.onAdminPreference}
          {...panelProps}
        />
      </div>
    {/if}
    <div class="shrink-0"><Language model={model.language} {...panelProps} /></div>
    <!-- Messaging settings are hidden until the messaging experience is ready. -->
    <div class="shrink-0"><Theme {model} {...panelProps} /></div>
    {#if fullModel && !panelProps.isAdmin}
      {#if !isGuestAccount}
        <div class="shrink-0">
          <Contributor
            attribution={fullModel.attribution}
            onAttribution={fullModel.onAttribution}
            {...panelProps}
          />
        </div>
      {/if}
      <div class="shrink-0">
        <DefaultMap model={fullModel.defaultMap} {...panelProps} />
      </div>
      <div class="shrink-0">
        <Experimental model={fullModel.experimental} {...panelProps} />
      </div>
    {/if}
  </div>
</Panel>
