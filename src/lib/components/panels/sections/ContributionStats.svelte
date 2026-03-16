<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'

// CONTEXT
const appCtx = getAppCtx()

const isSingleOrg = $derived((appCtx.hub as Hub)?.organisations?.length === 1)
appCtx.state.panels.profile.ctx!.observePrisms = !isSingleOrg

// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import Camera from 'virtual:icons/lucide/camera'
import MapPin from 'virtual:icons/lucide/map-pin'
import CubeTransparent from 'virtual:icons/lucide/ghost'
import ExclamationTriangle from 'virtual:icons/lucide/triangle-alert'
import type { UserProfile } from '$lib/db/zod/schema/user.types'

// PROPS
type Props = {
  userData?: UserProfile
}

let { userData }: Props = $props()

// DERIVED STATE - Get data from cache
let isChecked = $derived(!appCtx.state.panels.profile.ctx!.observePrisms)
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
        missingReports: (userData as any).reportedMissingCount || 0,
      }
    : null,
)
let isLoading = $derived(!userData)
let error = $derived<string | null>(null)

// GLOW COLOR HELPER
const getGlowColor = (statKey: string): string => {
  switch (statKey) {
    case 'features':
      return 'rgba(240, 77, 127, 0.4)' // primary: '#F04D7F'
    case 'images':
      return 'rgba(120, 89, 241, 0.4)' // accent: '#7859F1'
    case 'missingReports':
      return 'rgba(223, 69, 69, 0.4)' // warning: 'rgb(223, 69, 69)'
    default:
      return 'rgba(42, 50, 60, 0.4)' // neutral: '#2A323C'
  }
}

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
    bgColor: 'bg-primary/10',
    textColor: 'text-primary',
    label: m.omni__title_features(),
    targetId: 'contributed-features',
  },
  {
    key: 'images' as const,
    icon: Camera,
    bgColor: 'bg-accent/10',
    textColor: 'text-accent',
    label: m.filters__image(),
    targetId: 'contributed-images',
  },
  {
    key: 'missingReports' as const,
    icon: CubeTransparent,
    bgColor: 'bg-warning/10',
    textColor: 'text-warning',
    label: m.weak_equal_puffin_dig(),
    targetId: 'contributed-reports',
  },
]
</script>

<!-- ═══════════════════════ -->
<!-- 2.1 CONTRIBUTIONS :: STATS -->
<!-- ═══════════════════════ -->

<div class="border-b border-base-300 p-4">
  <div class="mb-3 flex items-center justify-between">
    <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/60">
      {m.dry_still_myna_yell()}
    </h3>
    {#if !isSingleOrg}
      <div class="flex items-center gap-2">
        <span class="text-xs text-base-content/70">{m.aqua_cozy_nils_scoop()}</span>
        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          checked={!isSingleOrg && isChecked}
          onchange={(e) => {
            appCtx.state.panels.profile.ctx!.observePrisms =
              !appCtx.state.panels.profile.ctx!.observePrisms;
            appCtx.refreshUserProfile();
          }}
        >
        <span class="text-xs text-base-content/70">{m.filters__all()}</span>
      </div>
    {/if}
  </div>

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
    <div class="flex flex-row items-stretch justify-between gap-3">
      {#each statsConfig as stat}
        <div class="flex flex-1 flex-col items-center justify-center gap-3">
          <button
            class="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-2xl {stat.bgColor} shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
            onclick={() => scrollToSection(stat.targetId)}
          >
            <!-- Background Icon -->
            <div class="absolute inset-0 flex items-center justify-center opacity-30">
              <Icon
                src={stat.icon}
                class="h-40 w-40 -translate-x-8 rotate-12 {stat.textColor}"
              />
            </div>

            <!-- Foreground Content -->
            <div class="relative z-10 flex flex-col items-center justify-center">
              <span
                class="text-6xl {stat.textColor} font-extrabold leading-none"
                style="font-family: 'Tilt Neon', sans-serif; text-shadow: 
                    0 0 8px {getGlowColor(stat.key)},
                    0 0 16px {getGlowColor(stat.key)}, 
                    0 0 24px {getGlowColor(stat.key)},
                    0 0 32px {getGlowColor(stat.key)};"
              >
                {stats[stat.key]}
              </span>
            </div>
          </button>
          <span
            class="text-center text-xs font-semibold uppercase tracking-wider text-base-content/70"
          >
            {stat.label}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
