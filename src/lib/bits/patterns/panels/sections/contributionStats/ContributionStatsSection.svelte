<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// ADAPTERS
import type { useProfilePanelModel } from '#lib/adapters/panels/useProfilePanelModel.svelte.js'

// COMPONENTS
import { Icon, Switch } from '#lib/bits/index.js'
import Settings from 'virtual:icons/proicons/settings'
import Camera from 'virtual:icons/proicons/camera'
import MapPin from 'virtual:icons/proicons/location'
import CubeTransparent from 'virtual:icons/lucide/ghost'
import ExclamationTriangle from 'virtual:icons/proicons/alert-triangle'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

// PROPS
type Props = {
  userData?: UserProfile
  model: ReturnType<typeof useProfilePanelModel>
}

let { userData, model }: Props = $props()

let settingsOpen = $state(false)
const settingsId = $props.id()

// DERIVED STATE - Get data from cache
let isChecked = $derived(!model.observePrisms)
let stats = $derived(
  userData
    ? {
        features: Object.values(userData.contributedFeatures || {}).reduce(
          (sum, arr) => sum + arr.length,
          0,
        ),
        images: Object.values(userData.contributedImages || {}).reduce(
          (sum, arr) => sum + arr.length,
          0,
        ),
        missingReports: userData.reportedMissingCount || 0,
      }
    : null,
)
let isLoading = $derived(!userData)
let error = $derived<string | null>(null)

// SMOOTH SCROLL HANDLER
const scrollToSection = (targetId: string) => {
  // Find the target element first
  const targetElement = document.getElementById(targetId)
  if (!targetElement) return

  // Find the closest scrollable container
  let scrollableArea = targetElement.closest('.overflow-y-auto') as HTMLElement

  // If not found, try to find any scrollable container in the Profile panel
  if (!scrollableArea) {
    // Look for profile panel by class or find scrollable area
    const profilePanel = document.querySelector(
      '[data-paneltype="profile"]',
    ) as HTMLElement
    if (profilePanel) {
      scrollableArea = profilePanel.querySelector('.overflow-y-auto') as HTMLElement
    }
  }

  // Fallback: find any scrollable area
  if (!scrollableArea) {
    scrollableArea = document.querySelector('.overflow-y-auto') as HTMLElement
  }

  if (!scrollableArea) return

  // Calculate the scroll position relative to the scrollable container
  const containerRect = scrollableArea.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const scrollTop = scrollableArea.scrollTop

  // Calculate target scroll position (with some offset for better UX)
  const targetScrollTop = scrollTop + (targetRect.top - containerRect.top) - 55

  // Smooth scroll to target
  scrollableArea.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

// STATS CONFIGURATION
const statsConfig = [
  {
    key: 'features' as const,
    icon: MapPin,
    label: m.omni__title_features(),
    targetId: 'contributed-features',
  },
  {
    key: 'images' as const,
    icon: Camera,
    label: m.filters__image(),
    targetId: 'contributed-images',
  },
  {
    key: 'missingReports' as const,
    icon: CubeTransparent,
    label: m.weak_equal_puffin_dig(),
    targetId: null,
  },
]
</script>

<!-- ═══════════════════════ -->
<!-- 2.1 CONTRIBUTIONS :: STATS -->
<!-- ═══════════════════════ -->

<div class="border-b border-border px-6 py-5">
  <div class="relative mb-3 pr-10">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {m.dry_still_myna_yell()}
    </h3>
    <button
      type="button"
      class="absolute right-0 -top-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      aria-label={m.menu_settings()}
      aria-expanded={settingsOpen}
      aria-controls={settingsId}
      onclick={() => (settingsOpen = !settingsOpen)}
    >
      <Icon src={Settings} class="size-4" />
    </button>
  </div>

  {#if settingsOpen}
    <div id={settingsId} transition:slide={{ duration: 220 }}>
      <div
        class="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-4 rounded-md border border-border bg-surface p-3"
      >
        {#if !model.isSingleOrganisation}
          <span class="text-xs font-medium text-muted-foreground"
            >{m.maps__title()}:</span
          >
          <div class="justify-self-end">
            <Switch
              size="sm"
              leftText={m.profile__maps_selected()}
              rightText={m.filters__all()}
              checked={isChecked}
              disabled={model.contributionSettingsDisabled}
              onCheckedChange={model.onToggleObservePrisms}
            />
          </div>
        {/if}
        <span class="text-xs font-medium text-muted-foreground"
          >{m.filters__status()}:</span
        >
        <div class="justify-self-end">
          <Switch
            size="sm"
            leftText={m.published()}
            rightText={m.filters__all()}
            checked={model.showAllContributions}
            disabled={model.contributionSettingsDisabled}
            onCheckedChange={model.onShowAllContributions}
          />
        </div>
      </div>
    </div>
  {/if}

  {#if isLoading}
    <div class="flex items-center justify-center py-4">
      <div class="loading loading-spinner loading-sm text-primary"></div>
      <span class="ml-2 text-sm text-base-content/60"
        >{m.plain_watery_macaw_grace()}</span
      >
    </div>
  {:else if error}
    <div class="flex items-center justify-center py-4 text-error">
      <Icon src={ExclamationTriangle} class="mr-1 h-4 w-4" />
      <span class="text-sm">{error}</span>
    </div>
  {:else if stats}
    <div class="grid grid-cols-3 gap-2">
      {#each statsConfig as stat}
        <button
          type="button"
          class="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface px-3 py-3 text-left transition-colors enabled:hover:border-primary/50 enabled:hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          disabled={!stat.targetId || stats[stat.key] === 0}
          onclick={() => stat.targetId && scrollToSection(stat.targetId)}
        >
          <!-- Small icons identify each contribution type without dominating the count. -->
          <Icon src={stat.icon} class="h-4 w-4 text-primary" />
          <!-- Counts and labels use the same typography as the other panels. -->
          <span
            class="text-2xl font-semibold leading-none tabular-nums text-base-content"
            >{stats[stat.key]}</span
          >
          <span class="max-w-full break-words text-xs text-muted-foreground"
            >{stat.label}</span
          >
        </button>
      {/each}
    </div>
  {/if}
</div>
