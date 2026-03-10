<script lang="ts">
// Animation
import { fly } from 'svelte/transition'
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// CONFIG
import { MOBILE_MAX_WIDTH, NEW_REF } from '$lib/index'
// Types
import type { Point } from 'geojson'
import type {
  Feature,
  NewFeatureWithLocationAndParents,
} from '$lib/db/zod/schema/feature.types'

// STATE : PROPS
let { feature }: { feature: Feature | NewFeatureWithLocationAndParents } = $props()

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : SESSION
const userPreferences = $derived({
  ...appCtx.getUserPreferences(),
  allowMachineTranslation: true,
})

let innerWidth = $state<number>()!
let featureCardEl: HTMLElement = $state()!
let portalEl: HTMLElement = $state()!

// Add ResizeObserver to watch feature card dimensions
$effect(() => {
  if (!featureCardEl) {
    featureCardEl = document.getElementById('feature-card')!
  }

  if (featureCardEl) {
    const observer = new ResizeObserver(() => {
      flyToFeature()
    })

    observer.observe(featureCardEl)
    return () => observer.disconnect()
  }
})

let rightOpen = $derived(appCtx.isRightPanelOpen())
let leftOpen = $derived(appCtx.isLeftPanelOpen())

// Track last known panel states to prevent unnecessary flyToFeature calls
let lastRightOpen = $state(false)
let lastLeftOpen = $state(false)

function getOffset() {
  const boundsMap = document.getElementById('map')?.getBoundingClientRect()
  const boundsLeftPanel = document
    .getElementById('leftPanel')
    ?.getBoundingClientRect() || { width: 0 }
  const boundsRightPanel = document
    .getElementById('rightPanel')
    ?.getBoundingClientRect() || { width: 0 }
  const boundsPortal = document
    .getElementById('feature-card-portal')
    ?.getBoundingClientRect()
  if (!boundsMap || !boundsPortal) return { xOffset: 0, yOffset: 0 }
  return {
    xOffset:
      boundsPortal.left -
      boundsMap.width / 2 +
      boundsPortal.width / 2 +
      (rightOpen ? boundsLeftPanel?.width : 0) -
      (leftOpen ? boundsRightPanel?.width : 0),
    yOffset: boundsPortal.top - boundsMap.height / 2 + boundsPortal.height / 2,
  }
}

function flyToFeature(duration: number = 2000, delay: number = 300) {
  setTimeout(() => {
    let { xOffset, yOffset } = getOffset()
    if (feature && appCtx.map && 'geometry' in feature) {
      // @ts-expect-error
      appCtx.map.easeTo({
        center: [
          (feature.geometry as Point).coordinates[0],
          (feature.geometry as Point).coordinates[1],
        ],
        offset: [xOffset, yOffset],
        zoom: 16,
        duration,
      })
    }
  }, delay)
}

// Recenter on new feature selection
$effect(() => {
  feature
  flyToFeature()
})

// Recenter on window resize on non-mobile
$effect(() => {
  if (innerWidth && innerWidth > MOBILE_MAX_WIDTH) {
    flyToFeature()
  }
})

// Track portal visibility with IntersectionObserver
let isPortalVisible = $state(false)

// IntersectionObserver to track portal visibility
$effect(() => {
  if (!portalEl) return

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        isPortalVisible = entry.isIntersecting
      })
    },
    {
      // Only consider visible when at least 50% of the portal is visible
      threshold: 0.75,
      // Use viewport as root
      root: null,
      rootMargin: '0px',
    },
  )

  observer.observe(portalEl)

  return () => {
    observer.disconnect()
  }
})

// Recenter on scroll end (only when visible)
$effect(() => {
  const handleContainerScrollEnd = () => {
    if (isPortalVisible) {
      flyToFeature(1000, 0)
    }
  }

  window.addEventListener('containerscrollend', handleContainerScrollEnd)

  return () => {
    window.removeEventListener('containerscrollend', handleContainerScrollEnd)
  }
})

// Recenter on panel state change
$effect(() => {
  const currentRightOpen = rightOpen
  const currentLeftOpen = leftOpen

  // Only fly to feature if panel states actually changed
  if (currentRightOpen !== lastRightOpen || currentLeftOpen !== lastLeftOpen) {
    flyToFeature(0)

    // Update last known states
    lastRightOpen = currentRightOpen
    lastLeftOpen = currentLeftOpen
  }
})

function wrapText(text: string, maxWidth: number = 170): string[] {
  const address = text.replace(', Hong Kong', '').replace('Hong Kong, ', '')
  // Try last comma
  const lastCommaIndex = address.lastIndexOf(',')
  if (lastCommaIndex > -1) {
    const parts = [
      address.slice(0, lastCommaIndex),
      address.slice(lastCommaIndex + 1).trim(),
    ]
    if (parts.every((part, index) => measureTextWidth(part) <= maxWidth - index * 40)) {
      return parts
    }
  }

  // Try first comma
  const firstCommaIndex = address.indexOf(',')
  if (firstCommaIndex > -1 && firstCommaIndex !== lastCommaIndex) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1).trim(),
    ]
    if (parts.every(part => measureTextWidth(part) <= maxWidth)) {
      return parts
    }
  }

  // Try both commas
  if (
    firstCommaIndex > -1 &&
    lastCommaIndex > -1 &&
    firstCommaIndex !== lastCommaIndex
  ) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1, lastCommaIndex).trim(),
      address.slice(lastCommaIndex + 1).trim(),
    ]
    if (parts.every(part => measureTextWidth(part) <= maxWidth)) {
      return parts
    }
  }

  // Fall back to word wrapping
  return wordWrap(address, maxWidth)
}

function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = words[0]

  for (let i = 1; i < words.length; i++) {
    const word = words[i]
    const withWord = `${currentLine} ${word}`

    if (measureTextWidth(withWord) <= maxWidth) {
      currentLine = withWord
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }

  lines.push(currentLine)
  return lines
}

function measureTextWidth(text: string): number {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return 0

  context.font = '0.875rem/1.25rem sans-serif' // text-sm/8
  return context.measureText(text).width
}

let addressLines = $derived(
  wrapText(getI18n(feature as Feature, 'displayAddress', userPreferences)),
)
let lastAddressLines: string[] = []
let lastAddressLineLengths: number[] = []
let displayAddressLines = $state<string[]>([])

$effect(() => {
  if (lastAddressLines[0] != addressLines[0]) {
    lastAddressLineLengths.push(addressLines.length)
    lastAddressLines = addressLines
    displayAddressLines = Array(4)
      .fill('')
      .map((empty, idx) => addressLines[idx] || empty)
  }
})
</script>

<svelte:window bind:innerWidth />

<div
  id="feature-card-portal"
  bind:this={portalEl}
  class="pointer-events-none relative h-[200px] w-[200px] overflow-visible pr-3 w-96:pr-12"
>
  <svg
    class="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <mask id="portal-mask">
        <rect width="100" height="100" fill="white"></rect>
        <circle cx="50" cy="50" r="48" fill="black"></circle>
      </mask>
    </defs>

    <rect width="100" height="100" fill="black" mask="url(#portal-mask)"></rect>

    <circle
      cx="50"
      cy="50"
      r="48"
      fill="none"
      stroke="#4379CF"
      stroke-width="2"
    ></circle>
  </svg>
  <div
    class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-[90px] translate-x-3 flex-col items-end gap-1 overflow-visible transition-all duration-300 w-100:translate-x-5"
    style="width: max-content;"
  >
    {#each displayAddressLines as line, index}
      {#key `${'id' in feature ? feature.id : NEW_REF}-${index}`}
        <span
          class="pointer-events-none absolute inline-block origin-bottom-right whitespace-nowrap rounded-full bg-[#1D232A] {line !=
          ''
            ? 'px-2 py-0.5 text-sm/6'
            : ''}"
          style="transform: translateX(-{index * 0}px); rotate: -17deg; top: {index *
            34}px;"
          in:fly={{
            duration: 300,
            x: -100,
            delay: (lastAddressLineLengths.at(-2) || 0) * 200 + index * 200
          }}
          out:fly={{ duration: 200, x: 100, delay: index * 200 }}
        >
          {line}
        </span>
      {/key}
    {/each}
  </div>

  <div
    class="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
  ></div>
</div>
