<script lang="ts">
import { browser } from '$app/env'
import { fade } from 'svelte/transition'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import { formatAnalyticsError } from '#lib/bits/patterns/analytics/analyticsError.js'
import { runRemoteQuery } from '#lib/remote/index.js'
// API
import {
  getAssetAnalyticsSummary,
  getPlatformAnalyticsSummary,
} from '#lib/api/analytics.remote.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// BITS
import PlatformAnalyticsDashboardSkeleton from '#lib/bits/patterns/analytics/platformAnalyticsDashboard/PlatformAnalyticsDashboardSkeleton.svelte'
import PlatformAnalyticsDashboard from '#lib/bits/patterns/analytics/platformAnalyticsDashboard/PlatformAnalyticsDashboard.svelte'
import {
  AssetAnalyticsDashboard,
  AssetAnalyticsDashboardSkeleton,
} from '#lib/bits/index.js'
// ICONS
import ChartColumnIncreasing from 'virtual:icons/proicons/bar-chart'
import Database from 'virtual:icons/proicons/database'
import Globe from 'virtual:icons/proicons/globe'
import Image from 'virtual:icons/proicons/photo'
import LoaderCircle from 'virtual:icons/proicons/spinner'
import RefreshCw from 'virtual:icons/proicons/arrow-sync'
import Users from 'virtual:icons/proicons/person-multiple'
// TYPES
import type { PlatformAnalyticsResult } from '#lib/api/services/platformAnalytics.types.js'
import type { AssetAnalyticsSummaryResult } from '#lib/api/services/assetAnalytics.types.js'

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

type AnalyticsFacet = 'views' | 'audience' | 'assets' | 'data'

const DEFAULT_ANALYTICS_FACET: AnalyticsFacet = 'assets'
const ANALYTICS_FACETS = [
  { ref: 'views', label: 'Views', icon: Globe },
  { ref: 'audience', label: 'Audience', icon: Users },
  { ref: 'assets', label: 'Assets', icon: Image },
  { ref: 'data', label: 'Data', icon: Database },
] as const satisfies ReadonlyArray<{
  ref: AnalyticsFacet
  label: string
  icon: typeof Globe
}>

adminCtx.setResourceType(false)

let activeFacet = $state<AnalyticsFacet>(DEFAULT_ANALYTICS_FACET)
const prismOrganisationIds = $derived([
  ...adminCtx.view.scope.getPrism(FirstClassResource.organisation),
])
const prismProjectIds = $derived([
  ...adminCtx.view.scope.getPrism(FirstClassResource.project),
])
const prismSignature = $derived(
  `${prismOrganisationIds.join('|')}::${prismProjectIds.join('|')}`,
)
let analyticsState = $state<AssetAnalyticsSummaryResult | null>(null)
let analyticsPreviewState = $state<AssetAnalyticsSummaryResult | null>(null)
let platformState = $state<PlatformAnalyticsResult | null>(null)
let hostname = $state('')
let isRefreshing = $state(false)
let analyticsRequestVersion = 0

/**
 * Resolves asset path prefixes from the active prism filters.
 *
 * @returns Scoped asset prefixes keyed by organisation and project codes.
 */
async function resolvePrismScopePrefixes(): Promise<string[]> {
  const prefixes = new Set<string>()

  for (const organisationId of prismOrganisationIds) {
    const organisation = await adminCtx.view.getOrganisationById(organisationId)
    const organisationCode = organisation?.code?.trim()
    if (organisationCode) {
      prefixes.add(`h/${organisationCode}/`)
    }
  }

  for (const projectId of prismProjectIds) {
    const project = await adminCtx.view.getProjectById(projectId)
    const projectCode = project?.code?.trim()

    if (!projectCode || !project?.organisationId) continue

    const organisation = await adminCtx.view.getOrganisationById(project.organisationId)
    const organisationCode = organisation?.code?.trim()

    if (!organisationCode) continue

    prefixes.add(`h/${organisationCode}/${projectCode}/`)
  }

  return [...prefixes]
}

/**
 * Builds the admin analytics remote query payload from the current prism state.
 *
 * @returns Remote query parameters including explicit admin intent metadata.
 */
async function buildAnalyticsQueryParams(): Promise<{
  scopePrefixes: string[]
  organisationIds: string[]
  projectIds: string[]
  meta: {
    isAdminRequest: boolean
  }
}> {
  const scopePrefixes = await resolvePrismScopePrefixes()
  console.debug('Asset analytics remote query scope', {
    organisationPrisms: prismOrganisationIds,
    projectPrisms: prismProjectIds,
    scopePrefixes,
  })

  return {
    scopePrefixes,
    organisationIds: prismOrganisationIds,
    projectIds: prismProjectIds,
    meta: { isAdminRequest: true },
  }
}

/**
 * Loads the current asset analytics snapshot for the active prism scope.
 *
 * @returns A normalized analytics summary result from the remote query.
 */
async function loadAnalytics(): Promise<AssetAnalyticsSummaryResult> {
  const params = await buildAnalyticsQueryParams()
  const result = await runRemoteQuery(getAssetAnalyticsSummary(params))
  console.debug('Asset analytics response summary', {
    params,
    status: result.status,
    message: 'message' in result ? result.message : null,
    scope:
      result.status === 'success' || result.status === 'empty'
        ? (result.data?.scope ?? null)
        : null,
    snapshot:
      result.status === 'success' || result.status === 'empty'
        ? {
            totals: {
              '1h': result.data?.windows['1h']?.totalRequests ?? null,
              '24h': result.data?.windows['24h']?.totalRequests ?? null,
              '7d': result.data?.windows['7d']?.totalRequests ?? null,
              '30d': result.data?.windows['30d']?.totalRequests ?? null,
            },
            notFound: {
              '1h': result.data?.windows['1h']?.notFoundPercent ?? null,
              '24h': result.data?.windows['24h']?.notFoundPercent ?? null,
              '7d': result.data?.windows['7d']?.notFoundPercent ?? null,
              '30d': result.data?.windows['30d']?.notFoundPercent ?? null,
            },
            topImages: {
              '1h':
                result.data?.windows['1h']?.topImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '24h':
                result.data?.windows['24h']?.topImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '7d':
                result.data?.windows['7d']?.topImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '30d':
                result.data?.windows['30d']?.topImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
            },
            topMissingImages: {
              '1h':
                result.data?.windows['1h']?.topMissingImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '24h':
                result.data?.windows['24h']?.topMissingImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '7d':
                result.data?.windows['7d']?.topMissingImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
              '30d':
                result.data?.windows['30d']?.topMissingImages
                  .slice(0, 3)
                  .map(row => row.publicId) ?? [],
            },
          }
        : null,
  })

  return result
}

/**
 * Refreshes analytics state while preventing stale responses from winning races.
 *
 * @param options - Controls whether the previous preview snapshot remains visible.
 * @returns Resolves when the in-flight refresh has settled.
 */
async function runAnalyticsLoad(options?: {
  preservePreview?: boolean
}): Promise<void> {
  const requestVersion = ++analyticsRequestVersion
  const preservePreview = options?.preservePreview ?? false

  if (!preservePreview) {
    analyticsState = null
    platformState = null
  }

  try {
    if (activeFacet !== 'assets') {
      const query = getPlatformAnalyticsSummary({
        facet: activeFacet,
        hostname: hostname || undefined,
        meta: { isAdminRequest: true },
      })
      if (preservePreview) await query.refresh()
      const result = await runRemoteQuery(query)
      if (requestVersion !== analyticsRequestVersion) return
      platformState = result
      isRefreshing = false
      return
    }
    const result = await loadAnalytics()

    if (requestVersion !== analyticsRequestVersion) return

    analyticsState = result
    analyticsPreviewState = result
  } catch (cause) {
    console.error(`${activeFacet} analytics remote query failed`, cause)

    if (requestVersion !== analyticsRequestVersion) return

    const message = formatAnalyticsError(cause)
    analyticsState = { status: 'error', message }
    platformState = { status: 'error', message }
  }

  if (requestVersion === analyticsRequestVersion) {
    isRefreshing = false
  }
}

/** Refreshes the active facet while retaining its last snapshot.
 * @returns Nothing; starts the guarded asynchronous load.
 */
function refreshAnalytics(): void {
  isRefreshing = true
  void runAnalyticsLoad({ preservePreview: true })
}

/** Formats a snapshot timestamp for the refresh tooltip.
 * @param value - Snapshot timestamp.
 * @returns Localized timestamp in Hong Kong time.
 */
function formatGeneratedAt(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Hong_Kong',
  }).format(date)
}

/** Selects a supported analytics dashboard.
 * @param nextFacet - Requested facet key.
 * @returns Nothing; ignores unknown facets.
 */
function handleFacetChange(nextFacet: string): void {
  if (!ANALYTICS_FACETS.some(facet => facet.ref === nextFacet)) return
  activeFacet = nextFacet as AnalyticsFacet
}

let lastPrismSignature = $state('')

$effect(() => {
  // Analytics owns its controls and must clear the previous resource list's filter bar.
  headerCtrl.setHeaderForStandAlone('Analytics', ChartColumnIncreasing, {
    showNew: false,
    showFilter: false,
    showFacets: true,
    showViewActions: true,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })

  headerCtrl.setFacets(
    ANALYTICS_FACETS.map(facet => ({ ...facet })),
    { active: activeFacet, onFacetChange: handleFacetChange },
  )

  headerCtrl.setViewActions([
    {
      text: isRefreshing ? 'Refreshing…' : 'Refresh',
      class: 'px-4',
      color: 'neutral',
      style: 'ghost',
      icon: isRefreshing ? LoaderCircle : RefreshCw,
      disabled: isRefreshing,
      attrs: {
        title:
          analyticsPreviewState &&
          (analyticsPreviewState.status === 'success' ||
            analyticsPreviewState.status === 'empty') &&
          activeFacet === 'assets'
            ? `Production asset analytics. Generated ${formatGeneratedAt(analyticsPreviewState.data?.generatedAt)}.`
            : 'Refresh analytics',
      },
      onClick: refreshAnalytics,
    },
  ])

  headerCtrl.clearFooter()
})

$effect(() => {
  if (!browser) return
  const signature = `${activeFacet}:${activeFacet === 'assets' ? prismSignature : hostname}`
  if (signature === lastPrismSignature) return
  lastPrismSignature = signature
  if (!lastPrismSignature) return
  void runAnalyticsLoad()
})
</script>

<section class="bits-theme flex h-full min-h-0 flex-col overflow-y-auto p-3 pb-12">
  {#if activeFacet === 'assets' ? !analyticsState : !platformState}
    <div in:fade={{ duration: 180 }} out:fade={{ duration: 140 }}>
      {#if activeFacet === 'assets'}
        <AssetAnalyticsDashboardSkeleton />
      {:else}
        <PlatformAnalyticsDashboardSkeleton facet={activeFacet} />
      {/if}
    </div>
  {:else}
    {#if activeFacet === 'assets' && analyticsState}
      <div class="relative">
        <div in:fade={{ duration: 220 }} out:fade={{ duration: 160 }}>
          <AssetAnalyticsDashboard state={analyticsState} />
        </div>
      </div>
    {:else if platformState && activeFacet !== 'assets'}
      {#key activeFacet}
        <PlatformAnalyticsDashboard
          state={platformState}
          facet={activeFacet}
          onHostChange={value => (hostname = value)}
        />
      {/key}
    {/if}

    <div class="h-12 shrink-0" aria-hidden="true"></div>
  {/if}
</section>
