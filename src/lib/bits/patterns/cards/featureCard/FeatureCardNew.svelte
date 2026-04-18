<script lang="ts">
// SVELTE
import { page } from '$app/state'
// CONSTANTS
import { NEW_REF } from '$lib'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// BITS
import FeatureCardActions from './components/FeatureCardActions.svelte'
import FeatureCardBreadcrumbs from './components/FeatureCardBreadcrumbs.svelte'
import FeatureCardContainer from './components/FeatureCardContainer.svelte'
import FeatureCardNewBody from './components/FeatureCardNewBody.svelte'
import FeatureCardRoot from './components/FeatureCardRoot.svelte'
import FeatureCardViewerContent from './components/FeatureCardViewerContent.svelte'
import * as FeatureCardActionPrimitive from './components/actions'
import ValidationError from '$lib/components/featureCard/ValidationError.svelte'
// PROVIDERS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx, setCardCtx } from '$lib/context/card.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx, setResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { FeatureCardMode, ImageContextResource, NewFeatureMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type {
  Organisation,
  OrganisationDB,
} from '$lib/db/zod/schema/organisation.types'
import type { Project, ProjectDB } from '$lib/db/zod/schema/project.types'
// LOCAL
import { getFeatureCardLayout } from './featureCard.layout'
import { getFeatureCardResponsiveWidth } from './featureCard.utils'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const cardCtx = (() => {
  try {
    return getCardCtx()
  } catch {
    return setCardCtx()
  }
})()
const responsiveCtx = (() => {
  try {
    return getResponsiveCtx()
  } catch {
    return setResponsiveCtx()
  }
})()
const mode = $derived(cardCtx.state.mode)
const responsiveWidth = $derived(getFeatureCardResponsiveWidth(responsiveCtx))
const layout = $derived(
  getFeatureCardLayout({
    width: responsiveCtx.visibleWindowWidth,
    height: responsiveCtx.visibleWindowHeight,
    responsiveWidth,
  }),
)

let feature = $state<Feature | null>(null)
let organisation = $state<Organisation | null>(null)
let project = $state<Project | null>(null)
let viewport = $state<HTMLElement>()
let viewerShellElement = $state<HTMLDivElement | null>(null)
let contentShellElement = $state<HTMLDivElement | null>(null)
let validationElement = $state<HTMLDivElement | null>(null)
let actionsElement = $state<HTMLDivElement | null>(null)
let bottomSpacerElement = $state<HTMLDivElement | null>(null)
let viewerTargetHeightPx = $state<number | null>(null)
let containerScrollable = $state(false)
let viewerBudgetFrame = 0
let previousMode: NewFeatureMode | null = null

/**
 * Reconciles new-feature card rounding drift between measured stack height and shell budget.
 *
 * @returns Pixel compensation applied to the computed viewer budget.
 */
function getNewFeatureHeightCompensationPx(): number {
  return 2
}

// Build the draft feature card payload from the active new-feature task.
function syncFeatureCardState(): boolean {
  const newFeature = appCtx.getNewFeature()
  if (!newFeature?.feature) {
    feature = null
    organisation = null
    project = null
    return false
  }

  feature = {
    ...(newFeature.feature as Feature),
    id: (newFeature.featureId ?? NEW_REF) as Feature['id'],
    organisationId: newFeature.organisationId as Feature['organisationId'],
    projectId: newFeature.projectId as Feature['projectId'],
    layerId: newFeature.layerId as Feature['layerId'],
    contributorId: newFeature.contributorId ?? null,
    isPublished: false,
    isArchived: false,
    isDraft: true,
    isPendingReview: true,
    properties: (newFeature.feature.properties ?? []) as Feature['properties'],
    i18n: (newFeature.feature.i18n ?? {}) as Feature['i18n'],
  } as Feature
  organisation =
    appCtx.cache.organisation.get(newFeature.organisationId as string) ?? null
  project = appCtx.cache.project.get(newFeature.projectId as string) ?? null

  return Boolean(feature && organisation && project)
}

function handleShowCard(): void {
  if (!syncFeatureCardState()) return

  cardCtx.setMode(FeatureCardMode.New)
  omniCtx.setCardCtx(cardCtx)
  omniCtx.openCard()
}

function handleCloseCard(): void {
  omniCtx.closeCard()
}

/**
 * Measures layout height without animation transforms so opening FLIP motion
 * cannot shrink the viewer budget inputs.
 *
 * @param element Element whose layout height should be read.
 * @returns Stable layout height in pixels.
 */
function measureElementHeight(element: HTMLElement | null | undefined): number {
  return element?.offsetHeight ?? 0
}

function scheduleViewerBudgetUpdate(): void {
  if (viewerBudgetFrame) return

  viewerBudgetFrame = requestAnimationFrame(() => {
    viewerBudgetFrame = 0
    updateViewerBudget()
  })
}

function updateViewerBudget(): void {
  const viewportElement = viewport
  const viewerShell = viewerShellElement
  const contentShell = contentShellElement

  if (!viewportElement || !viewerShell || !contentShell) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  const actionsHeight = measureElementHeight(actionsElement)
  const bottomSpacerHeight = measureElementHeight(bottomSpacerElement)
  const contentHeight = measureElementHeight(contentShell)
  const staticHeight = contentHeight + actionsHeight + bottomSpacerHeight
  const shellElement = document.getElementById('feature-card-shell')
  const shellStyle = shellElement ? getComputedStyle(shellElement) : null
  const chromeBorderHeight = shellStyle
    ? (Number.parseFloat(shellStyle.borderTopWidth) || 0) +
      (Number.parseFloat(shellStyle.borderBottomWidth) || 0)
    : layout.chromeBorderWidthPx * 2
  const availableHeight =
    layout.heightBudgetPx -
    staticHeight -
    chromeBorderHeight +
    getNewFeatureHeightCompensationPx()
  const viewerBlockMinHeightPx =
    layout.viewerMinHeightPx + layout.viewerTopPaddingPx + layout.viewerPaddingPx
  const collapsedScrollable = availableHeight < viewerBlockMinHeightPx

  containerScrollable = collapsedScrollable
  viewerTargetHeightPx = collapsedScrollable ? null : availableHeight
}

function handleEditSelection(): void {
  appCtx.setNewFeatureMode(NewFeatureMode.parents)
}

function handleRootContentVisibilityChange(visible: boolean): void {
  if (!visible) return

  scheduleViewerBudgetUpdate()

  requestAnimationFrame(() => {
    scheduleViewerBudgetUpdate()

    requestAnimationFrame(() => {
      scheduleViewerBudgetUpdate()
    })
  })
}

$effect(() => {
  const currentMode = appCtx.newFeatureMode
  const isEnteringCard =
    currentMode === NewFeatureMode.card && previousMode !== NewFeatureMode.card
  const isLeavingCard =
    currentMode !== NewFeatureMode.card && previousMode === NewFeatureMode.card

  if (isEnteringCard) {
    handleShowCard()
  } else if (isLeavingCard) {
    handleCloseCard()
  }

  previousMode = currentMode
})

$effect(() => {
  const currentLayout = layout
  const viewportElement = viewport
  const contentShell = contentShellElement

  void currentLayout

  if (!viewportElement || !viewerShellElement || !contentShell) {
    containerScrollable = false
    viewerTargetHeightPx = null
    return
  }

  const observer = new ResizeObserver(() => {
    scheduleViewerBudgetUpdate()
  })

  observer.observe(viewportElement)
  observer.observe(contentShell)
  if (validationElement) observer.observe(validationElement)
  if (actionsElement) observer.observe(actionsElement)
  if (bottomSpacerElement) observer.observe(bottomSpacerElement)

  scheduleViewerBudgetUpdate()

  return () => {
    observer.disconnect()
    if (viewerBudgetFrame) {
      cancelAnimationFrame(viewerBudgetFrame)
      viewerBudgetFrame = 0
    }
  }
})

$effect(() => {
  const isCardOpen = omniCtx.state.isCardOpen
  const transitionPhase = omniCtx.cardTransition.phase

  if (!isCardOpen) return
  void transitionPhase

  scheduleViewerBudgetUpdate()
})

const imageProviderModel = useImageProviderModel(
  () => page,
  () => ({
    isAdminMode: false,
    context: {
      ctxType: ImageContextResource.feature,
      ctxId: (appCtx.getNewFeature()?.featureId ?? NEW_REF) as string,
      organisation: organisation as unknown as Omit<OrganisationDB, 'isCoreInclusive'>,
      project: project as unknown as Omit<ProjectDB, 'isCoreInclusive'>,
    },
  }),
)
</script>

{#if appCtx.newFeatureMode === NewFeatureMode.card && feature && organisation && project}
  <ImageProvider model={imageProviderModel}>
    <FeatureCardRoot onContentVisibilityChange={handleRootContentVisibilityChange}>
      <div class="pointer-events-none flex min-h-0 flex-1 flex-col">
        <FeatureCardContainer bind:viewport scrollable={containerScrollable}>
          <div
            bind:this={viewerShellElement}
            class="pointer-events-none flex min-h-0 w-full shrink-0 flex-col items-stretch"
          >
            <FeatureCardViewerContent
              scrollable={containerScrollable}
              minHeightPx={layout.viewerMinHeightPx}
              paddingPx={layout.viewerPaddingPx}
              topPaddingPx={layout.viewerTopPaddingPx}
              targetHeightPx={viewerTargetHeightPx}
            />
          </div>

          <div
            bind:this={contentShellElement}
            class="pointer-events-none flex shrink-0 flex-col"
          >
            <FeatureCardBreadcrumbs {feature} onEditSelection={handleEditSelection} />
            {#if viewport}
              <FeatureCardNewBody {viewport} {feature} />
            {/if}
          </div>
        </FeatureCardContainer>

        <div bind:this={actionsElement}>
          <FeatureCardActions
            centerRightActionsOnMobile={mode !== FeatureCardMode.Display}
          >
            {#snippet topActions()}
              <div bind:this={validationElement} class="min-w-0">
                <ValidationError />
              </div>
            {/snippet}
            {#snippet rightActions()}
              <FeatureCardActionPrimitive.SubmitNewFeatureAction />
            {/snippet}
          </FeatureCardActions>
        </div>

        {#if layout.bottomSpacerPx > 0}
          <div
            bind:this={bottomSpacerElement}
            aria-hidden="true"
            class="shrink-0 bg-black"
            style={`height: ${layout.bottomSpacerPx}px;`}
          ></div>
        {/if}
      </div>
    </FeatureCardRoot>
  </ImageProvider>
{/if}
