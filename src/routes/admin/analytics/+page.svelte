<script lang="ts">
import { browser } from '$app/environment'
import { fade } from 'svelte/transition'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import { runRemoteQuery } from '$lib/remote'
// API
import { getAssetAnalyticsSummary } from '$lib/api/server/analytics.remote'
// I18N
import { getLocale, m } from '$lib/i18n'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// BITS
import { AssetAnalyticsDashboard, AssetAnalyticsDashboardSkeleton } from '$lib/bits'
// ICONS
import ChartColumnIncreasing from 'virtual:icons/lucide/chart-column-increasing'
import Database from 'virtual:icons/lucide/database'
import Globe from 'virtual:icons/lucide/globe'
import Image from 'virtual:icons/lucide/image'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
import RefreshCw from 'virtual:icons/lucide/refresh-cw'
import Users from 'virtual:icons/lucide/users'
// TYPES
import type { AssetAnalyticsSummaryResult } from '$lib/types'

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
  ...adminCtx.appCtx.getPrism(FirstClassResource.organisation),
])
const prismProjectIds = $derived([
  ...adminCtx.appCtx.getPrism(FirstClassResource.project),
])
const prismSignature = $derived(
  `${prismOrganisationIds.join('|')}::${prismProjectIds.join('|')}`,
)

let analyticsState = $state<AssetAnalyticsSummaryResult | null>(null)
let analyticsPreviewState = $state<AssetAnalyticsSummaryResult | null>(null)
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
    const organisation = await adminCtx.appCtx.getOrganisationById(organisationId)
    const organisationCode = organisation?.code?.trim()
    if (organisationCode) {
      prefixes.add(`h/${organisationCode}/`)
    }
  }

  for (const projectId of prismProjectIds) {
    const project = await adminCtx.appCtx.getProjectById(projectId)
    const projectCode = project?.code?.trim()
    if (!projectCode || !project?.organisationId) continue

    const organisation = await adminCtx.appCtx.getOrganisationById(
      project.organisationId,
    )
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
    meta: {
      isAdminRequest: true,
    },
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
  }

  try {
    const result = await loadAnalytics()
    if (requestVersion !== analyticsRequestVersion) return

    analyticsState = result
    analyticsPreviewState = result
  } catch (cause) {
    console.error('Asset analytics remote query failed', cause)
    if (requestVersion !== analyticsRequestVersion) return

    analyticsState = {
      status: 'error',
      message: 'Failed to load analytics.',
    }
  }

  if (requestVersion === analyticsRequestVersion) {
    isRefreshing = false
  }
}

function refreshAnalytics(): void {
  isRefreshing = true
  void runAnalyticsLoad({ preservePreview: true })
}

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

function handleFacetChange(nextFacet: string): void {
  if (!ANALYTICS_FACETS.some(facet => facet.ref === nextFacet)) return
  activeFacet = nextFacet as AnalyticsFacet
}

let lastPrismSignature = $state('')

$effect(() => {
  headerCtrl.setHeaderForIndex('Analytics', ChartColumnIncreasing, {
    showNew: false,
    showFilter: false,
    showFacets: true,
    showViewActions: true,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  headerCtrl.setFacets(
    ANALYTICS_FACETS.map(facet => ({ ...facet })),
    {
      active: activeFacet,
      onFacetChange: handleFacetChange,
    },
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
            analyticsPreviewState.status === 'empty')
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
  if (prismSignature === lastPrismSignature) return
  lastPrismSignature = prismSignature
  if (!lastPrismSignature) return
  void runAnalyticsLoad()
})
</script>

<section class="bits-theme flex h-full min-h-0 flex-col overflow-y-auto p-6 pb-12">
  {#if !analyticsState}
    <div in:fade={{ duration: 180 }} out:fade={{ duration: 140 }}>
      <AssetAnalyticsDashboardSkeleton />
    </div>
  {:else}
    {#if activeFacet === 'assets'}
      <div class="relative">
        <div in:fade={{ duration: 220 }} out:fade={{ duration: 160 }}>
          <AssetAnalyticsDashboard state={analyticsState} />
        </div>
      </div>
    {:else}
      <section class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <article class="rounded-xl border border-base-300 bg-base-100 p-6">
          <h2 class="text-xl font-semibold text-foreground">
            {#if activeFacet === 'views'}
              {m.analytics__views_title()}
            {:else if activeFacet === 'audience'}
              {m.analytics__audience_title()}
            {:else}
              {m.analytics__data_title()}
            {/if}
          </h2>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-foreground-alt">
            {#if activeFacet === 'views'}
              {m.analytics__views_description()}
            {:else if activeFacet === 'audience'}
              {m.analytics__audience_description()}
            {:else}
              {m.analytics__data_description()}
            {/if}
          </p>

          <div class="mt-6 grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-base-300 bg-base-50 p-4">
              <h3
                class="text-sm font-semibold uppercase tracking-[0.18em] text-foreground-alt"
              >
                {m.filters__status()}
              </h3>
              <p class="mt-2 text-sm text-foreground">
                {m.analytics__status_unwired()}
              </p>
            </div>

            <div class="rounded-lg border border-base-300 bg-base-50 p-4">
              <h3
                class="text-sm font-semibold uppercase tracking-[0.18em] text-foreground-alt"
              >
                {m.analytics__scope()}
              </h3>
              <p class="mt-2 text-sm text-foreground">
                {m.analytics__scope_unimplemented()}
              </p>
            </div>
          </div>
        </article>

        <aside class="rounded-xl border border-base-300 bg-base-100 p-6">
          <h3
            class="text-sm font-semibold uppercase tracking-[0.18em] text-foreground-alt"
          >
            {m.analytics__next_steps()}
          </h3>
          <ul class="mt-4 space-y-3 text-sm leading-6 text-foreground">
            {#if activeFacet === 'views'}
              <li>{m.analytics__views_next_step_1()}</li>
              <li>{m.analytics__views_next_step_2()}</li>
            {:else if activeFacet === 'audience'}
              <li>{m.analytics__audience_next_step_1()}</li>
              <li>{m.analytics__audience_next_step_2()}</li>
            {:else}
              <li>{m.analytics__data_next_step_1()}</li>
              <li>{m.analytics__data_next_step_2()}</li>
            {/if}
          </ul>
        </aside>
      </section>
    {/if}

    <div class="h-12 shrink-0" aria-hidden="true"></div>
  {/if}
</section>
