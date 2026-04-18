<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import type { Component } from 'svelte'
// I18N
import { getFPI18n, getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// REMOTE
import { getFeature, getFeatures } from '$lib/api/server/feature.remote'
import { getLayer } from '$lib/api/server/layer.remote'
import { getProject } from '$lib/api/server/project.remote'
// SERVICES
import { getURLfromImage } from '$lib/client/services/image'
// BITS
import { PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
// ENUMS
import { Panel as PanelType } from '$lib/enums'
// ICONS
import BelgiumFlagIcon from 'virtual:icons/circle-flags/be'
import ChinaFlagIcon from 'virtual:icons/circle-flags/cn'
import CzechiaFlagIcon from 'virtual:icons/circle-flags/cz'
import GermanyFlagIcon from 'virtual:icons/circle-flags/de'
import SpainFlagIcon from 'virtual:icons/circle-flags/es'
import EuropeanUnionFlagIcon from 'virtual:icons/circle-flags/eu'
import FinlandFlagIcon from 'virtual:icons/circle-flags/fi'
import FranceFlagIcon from 'virtual:icons/circle-flags/fr'
import HongKongFlagIcon from 'virtual:icons/circle-flags/hk'
import HungaryFlagIcon from 'virtual:icons/circle-flags/hu'
import IrelandFlagIcon from 'virtual:icons/circle-flags/ie'
import ItalyFlagIcon from 'virtual:icons/circle-flags/it'
import JapanFlagIcon from 'virtual:icons/circle-flags/jp'
import SouthKoreaFlagIcon from 'virtual:icons/circle-flags/kr'
import NetherlandsFlagIcon from 'virtual:icons/circle-flags/nl'
import PolandFlagIcon from 'virtual:icons/circle-flags/pl'
import PortugalFlagIcon from 'virtual:icons/circle-flags/pt'
import ScanLineIcon from 'virtual:icons/lucide/scan-line'
import SloveniaFlagIcon from 'virtual:icons/circle-flags/si'
import SwitzerlandFlagIcon from 'virtual:icons/circle-flags/ch'
import TaiwanFlagIcon from 'virtual:icons/circle-flags/tw'
import UkraineFlagIcon from 'virtual:icons/circle-flags/ua'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { ProjectDetailProfile } from '$lib/db/zod/schema/project.types'
import type { PanelProps, PassportStamp } from '$lib/types'

const appCtx = getAppCtx()
const passportLayerIds = ['vli8hfmD-XEZ', '0bf1RYWdpaAt', 'lvWu_dCwiVZt'] as const

type PassportSection = {
  layerId: string
  layerName: string
  stampCountLabel: string
  stamps: PassportStamp[]
}

const flagIconByCode: Record<string, Component> = {
  be: BelgiumFlagIcon,
  cn: ChinaFlagIcon,
  cz: CzechiaFlagIcon,
  de: GermanyFlagIcon,
  es: SpainFlagIcon,
  eu: EuropeanUnionFlagIcon,
  fi: FinlandFlagIcon,
  fr: FranceFlagIcon,
  hk: HongKongFlagIcon,
  hu: HungaryFlagIcon,
  ie: IrelandFlagIcon,
  it: ItalyFlagIcon,
  jp: JapanFlagIcon,
  kr: SouthKoreaFlagIcon,
  nl: NetherlandsFlagIcon,
  pl: PolandFlagIcon,
  pt: PortugalFlagIcon,
  si: SloveniaFlagIcon,
  ch: SwitzerlandFlagIcon,
  tw: TaiwanFlagIcon,
  ua: UkraineFlagIcon,
}

let panelProps: PanelProps = $derived({
  panelType: PanelType.passport,
  position: 'left',
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

let headerTitle = $state('Passport')
let subtitle = $state('Sites Visited')
let sectionTitle = $state('Project')
let stampCountLabel = $state('0 stamps')
let projectImageUrl = $state<string | null>(null)
let passportSections = $state<PassportSection[]>([])
let isLoading = $state(true)
let errorMessage = $state('')

function shuffleFeatures(features: FeatureFromCollection[]): FeatureFromCollection[] {
  const nextFeatures = [...features]

  for (let index = nextFeatures.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[nextFeatures[index], nextFeatures[swapIndex]] = [
      nextFeatures[swapIndex],
      nextFeatures[index],
    ]
  }

  return nextFeatures
}

function getFirstAddressLine(feature: FeatureFromCollection): string {
  const displayAddress = getI18n(
    feature,
    'displayAddress',
    appCtx.getUserPreferences(),
    'Address to confirm',
  )

  return displayAddress.split(',')[0]?.trim() || 'Address to confirm'
}

function getCountryValue(feature: FeatureFromCollection): string | null {
  const countryProperty = feature.properties.find(property =>
    ['country', 'countries'].includes(property.property?.key?.toLowerCase() ?? ''),
  )

  if (!countryProperty) return null

  const country = getFPI18n(countryProperty, appCtx.getUserPreferences()).trim()
  return country && country !== '-' ? country : null
}

function getCountryFlagCode(country: string | null): string | null {
  const normalizedCountry = country?.trim().toLowerCase()

  if (!normalizedCountry) return null

  if (
    normalizedCountry === 'belgium & slovenia' ||
    normalizedCountry === 'belgium and slovenia'
  ) {
    return 'be'
  }

  if (normalizedCountry === 'belgium') {
    return 'be'
  }

  if (normalizedCountry === 'slovenia') {
    return 'si'
  }

  if (normalizedCountry === 'czechia' || normalizedCountry === 'czech republic') {
    return 'cz'
  }

  if (
    normalizedCountry === 'hksar' ||
    normalizedCountry === 'hong kong' ||
    normalizedCountry === '香港特區' ||
    normalizedCountry === '香港特区' ||
    normalizedCountry === 'hong kong sar'
  ) {
    return 'hk'
  }

  if (
    normalizedCountry === 'china' ||
    normalizedCountry === '中國' ||
    normalizedCountry === '中国'
  ) {
    return 'cn'
  }

  if (normalizedCountry === 'japan' || normalizedCountry === '日本') {
    return 'jp'
  }

  if (normalizedCountry === 'germany') {
    return 'de'
  }

  if (normalizedCountry === 'poland') {
    return 'pl'
  }

  if (normalizedCountry === 'portugal') {
    return 'pt'
  }

  if (normalizedCountry === 'spain') {
    return 'es'
  }

  if (normalizedCountry === 'switzerland') {
    return 'ch'
  }

  if (normalizedCountry === 'finland') {
    return 'fi'
  }

  if (normalizedCountry === 'france') {
    return 'fr'
  }

  if (normalizedCountry === 'hungary') {
    return 'hu'
  }

  if (normalizedCountry === 'ireland') {
    return 'ie'
  }

  if (normalizedCountry === 'italy') {
    return 'it'
  }

  if (
    normalizedCountry === 'netherlands' ||
    normalizedCountry === 'the netherlands' ||
    normalizedCountry === 'nederland'
  ) {
    return 'nl'
  }

  if (normalizedCountry === 'ukraine') {
    return 'ua'
  }

  if (
    normalizedCountry === 'taiwan' ||
    normalizedCountry === '台灣' ||
    normalizedCountry === '台湾'
  ) {
    return 'tw'
  }

  if (
    normalizedCountry === 'south korea' ||
    normalizedCountry === 'korea' ||
    normalizedCountry === '대한민국'
  ) {
    return 'kr'
  }

  return null
}

async function loadDetailedFeatures(
  features: FeatureFromCollection[],
): Promise<FeatureFromCollection[]> {
  const selectedFeatures = [...features]

  return await Promise.all(
    selectedFeatures.map(async feature => {
      const response = await getFeature({
        ref: feature.id,
        refKey: 'id',
        meta: { profile: 'detail' },
      })

      return (response.data as FeatureFromCollection | null) ?? feature
    }),
  )
}

function toPassportStamps(features: FeatureFromCollection[]): PassportStamp[] {
  return features.map(feature => {
    const country = getCountryValue(feature)

    return {
      featureId: feature.id,
      title: getI18n(feature, 'title', appCtx.getUserPreferences(), feature.id),
      addressLine: getFirstAddressLine(feature),
      country,
      flagCode: getCountryFlagCode(country),
      imageUrl: feature.image
        ? getURLfromImage({ image: feature.image as ImageContextEnvelope })
        : null,
    }
  })
}

function buildAllBooksStamp(
  imageUrl: string | null,
  layerName: string,
  layerId: string,
): PassportStamp {
  return {
    featureId: `elnPassportAllBooks:${layerId}`,
    title: 'All Books',
    addressLine: layerName,
    country: 'European Union',
    flagCode: 'eu',
    imageUrl,
  }
}

function getLayerYear(layerName: string): number {
  const match = layerName.match(/\b(19|20)\d{2}\b/u)
  return match ? Number(match[0]) : 0
}

async function loadPassportDemo(): Promise<void> {
  isLoading = true
  errorMessage = ''

  try {
    const layerResponses = await Promise.all(
      passportLayerIds.map(layerId =>
        getLayer({
          ref: layerId,
          refKey: 'id',
          meta: { profile: 'detail' },
        }),
      ),
    )
    const layers = layerResponses
      .map(response => response.data as Layer | null)
      .filter((layer): layer is Layer => Boolean(layer))

    if (layers.length === 0) {
      errorMessage = 'Could not resolve the source layers for this passport.'
      passportSections = []
      return
    }

    const [projectResponse, featureResponses] = await Promise.all([
      getProject({
        ref: layers[0].projectId,
        refKey: 'id',
        meta: { profile: 'detail' },
      }),
      Promise.all(
        layers.map(layer =>
          getFeatures({
            conditions: {
              layerId: layer.id,
              isArchived: false,
              isPublished: true,
            },
            pagination: {
              limit: 24,
            },
            meta: { profile: 'list' },
          }),
        ),
      ),
    ])

    const project = projectResponse.data as ProjectDetailProfile | null
    const projectName = project
      ? getI18n(project as never, 'name', appCtx.getUserPreferences(), 'Project')
      : 'Project'

    sectionTitle = projectName
    projectImageUrl = project?.image
      ? getURLfromImage({ image: project.image as ImageContextEnvelope })
      : null

    const nextSections = await Promise.all(
      layers.map(async (layer, index) => {
        const layerName = getI18n(
          layer,
          'nameShort',
          appCtx.getUserPreferences(),
          getI18n(layer, 'name', appCtx.getUserPreferences(), 'Layer'),
        )
        const features =
          (
            featureResponses[index]?.data as FeatureFromCollection[] | undefined
          )?.filter(feature =>
            Boolean(getI18n(feature, 'title', appCtx.getUserPreferences(), '').trim()),
          ) ?? []
        const detailedFeatures = await loadDetailedFeatures(shuffleFeatures(features))
        const stamps = [
          buildAllBooksStamp(projectImageUrl, layerName, layer.id),
          ...toPassportStamps(detailedFeatures),
        ]

        return {
          layerId: layer.id,
          layerName,
          stampCountLabel: `${stamps.length} ${stamps.length === 1 ? 'stamp' : 'stamps'}`,
          stamps,
        }
      }),
    )

    passportSections = nextSections.sort(
      (left, right) => getLayerYear(right.layerName) - getLayerYear(left.layerName),
    )

    const totalStampCount = passportSections.reduce(
      (count, section) => count + section.stamps.length,
      0,
    )
    stampCountLabel = `${totalStampCount} ${totalStampCount === 1 ? 'stamp' : 'stamps'}`

    if (passportSections.every(section => section.stamps.length === 0)) {
      errorMessage = 'No published stamps are available for these layers yet.'
    }
  } catch (error) {
    console.error('Failed to load passport panel', error)
    errorMessage = 'Unable to build the passport right now.'
    projectImageUrl = null
    passportSections = []
  } finally {
    isLoading = false
  }
}

onMount(() => {
  void loadPassportDemo()
})
</script>

<Panel {...panelProps}>
  <Header {...panelProps} title={headerTitle} />

  <div class="relative flex min-h-full flex-col bg-black">
    <section
      class="border-b border-white/10 bg-[linear-gradient(180deg,#141218_0%,#101116_100%)] px-4 py-4"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.35em] text-accent">
            {subtitle}
          </p>
          <p class="text-sm leading-6 text-white/72">
            A record of the event sites you have visited, with each stop added as a
            passport stamp.
          </p>
        </div>

        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/[0.06] text-accent"
        >
          <ScanLineIcon class="h-7 w-7" />
        </div>
      </div>
    </section>

    {#if isLoading}
      <div
        class="flex flex-1 items-center justify-center px-6 py-12 text-sm text-base-content/60"
      >
        Building passport...
      </div>
    {:else if errorMessage}
      <div
        class="m-4 rounded-3xl border border-warning/30 bg-warning/10 px-4 py-5 text-sm leading-6 text-base-content/80"
      >
        {errorMessage}
      </div>
    {:else}
      <section
        class="bg-[linear-gradient(180deg,#050608_0%,#000000_100%)] px-3 py-4 pb-8"
      >
        <div class="mb-4 flex items-end justify-between gap-3 px-1">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold leading-5 text-white">{sectionTitle}</h3>
          </div>
          <div
            class="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72"
          >
            {stampCountLabel}
          </div>
        </div>
        <div class="space-y-8">
          {#each passportSections as section (section.layerId)}
            <section class="space-y-4">
              <div class="flex items-end justify-between gap-3 px-1">
                <div class="min-w-0">
                  <h4 class="text-sm font-semibold leading-5 text-white">
                    {section.layerName}
                  </h4>
                </div>
                <div
                  class="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/60"
                >
                  {section.stampCountLabel}
                </div>
              </div>

              <div class="grid grid-cols-3 gap-x-3 gap-y-5">
                {#each section.stamps as stamp (stamp.featureId)}
                  <article class="flex min-h-40 flex-col">
                    <div class="flex justify-center">
                      <div class="relative h-30 w-30">
                        {#if stamp.flagCode && flagIconByCode[stamp.flagCode]}
                          <svelte:component
                            this={flagIconByCode[stamp.flagCode]}
                            class="absolute inset-0 h-full w-full"
                          />
                        {:else}
                          <div
                            class="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#2b313d_0%,#111827_100%)]"
                          ></div>
                        {/if}
                        <div
                          class="absolute inset-[6px] rounded-full bg-black/88 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
                        ></div>
                        <div
                          class="absolute inset-[13px] overflow-hidden rounded-full bg-[#0f1115] ring-1 ring-white/12"
                        >
                          {#if stamp.imageUrl}
                            <img
                              src={stamp.imageUrl}
                              alt={stamp.title}
                              class="h-full w-full object-cover"
                              loading="lazy"
                            >
                          {:else}
                            <div
                              class="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#1f2937_0%,#111827_100%)] px-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70"
                            >
                              {stamp.country ?? 'Site'}
                            </div>
                          {/if}
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 min-w-0 space-y-1 text-center">
                      <h4
                        class="line-clamp-2 text-xs font-semibold leading-5 text-white"
                      >
                        {stamp.title}
                      </h4>
                      <p class="truncate text-[11px] leading-4 text-white/55">
                        {stamp.addressLine}
                      </p>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</Panel>
