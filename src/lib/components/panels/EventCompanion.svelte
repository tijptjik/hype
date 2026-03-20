<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
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
import { Button, PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
// ENUMS
import { Panel as PanelType } from '$lib/enums'
// ICONS
import CalendarHeartIcon from 'virtual:icons/lucide/calendar-heart'
import FacebookIcon from 'virtual:icons/lucide/facebook'
import GlobeIcon from 'virtual:icons/lucide/globe'
import InstagramIcon from 'virtual:icons/lucide/instagram'
import LinkedinIcon from 'virtual:icons/lucide/linkedin'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { ProjectDetailProfile } from '$lib/db/zod/schema/project.types'
import type { EventCompanionPlatform, EventCompanionRole, PanelProps } from '$lib/types'

const appCtx = getAppCtx()
const eventCompanionLayerIds = ['vli8hfmD-XEZ', '0bf1RYWdpaAt', 'lvWu_dCwiVZt'] as const
const companionRoles: EventCompanionRole[] = ['host', 'author', 'performer']
const platformSequence: EventCompanionPlatform[] = [
  'instagram',
  'linkedin',
  'facebook',
  'web',
]
const platformMeta = {
  instagram: {
    icon: InstagramIcon,
    label: 'Instagram',
    color: 'accent',
  },
  linkedin: {
    icon: LinkedinIcon,
    label: 'LinkedIn',
    color: 'info',
  },
  facebook: {
    icon: FacebookIcon,
    label: 'Facebook',
    color: 'primary',
  },
  web: {
    icon: GlobeIcon,
    label: 'Website',
    color: 'dark',
  },
} as const

type EventCompanionFollowAction = {
  href: string
  platform: EventCompanionPlatform
}

type EventCompanionParticipant = {
  label: string
  actions: EventCompanionFollowAction[]
}

type EventCompanionSession = {
  featureId: string
  title: string
  addressLine: string
  imageUrl: string | null
  buyHref: string
  follows: Record<EventCompanionRole, EventCompanionParticipant | null>
}

let panelProps: PanelProps = $derived({
  panelType: PanelType.eventCompanion,
  position: 'left',
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

let headerTitle = $state('Event companion')
let subtitle = $state('Attendee leaflet')
let latestLayerName = $state('Latest sessions')
let sectionTitle = $state('Personal picks')
let sessionCountLabel = $state('0 sessions')
let projectImageUrl = $state<string | null>(null)
let sessionCards = $state<EventCompanionSession[]>([])
let isLoading = $state(true)
let errorMessage = $state('')
let upcomingEventsHref = $state('/layers')

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

function getLayerYear(layerName: string): number {
  const match = layerName.match(/\b(19|20)\d{2}\b/u)
  return match ? Number(match[0]) : 0
}

function getLayerDisplayName(layer: Layer): string {
  return getI18n(
    layer,
    'nameShort',
    appCtx.getUserPreferences(),
    getI18n(layer, 'name', appCtx.getUserPreferences(), 'Layer'),
  )
}

function getFirstAddressLine(feature: FeatureFromCollection): string {
  const displayAddress = getI18n(
    feature,
    'displayAddress',
    appCtx.getUserPreferences(),
    'Venue to be confirmed',
  )

  return displayAddress.split(',')[0]?.trim() || 'Venue to be confirmed'
}

function getFeaturePropertyValue(
  feature: FeatureFromCollection,
  key: EventCompanionRole,
): string | null {
  const property = feature.properties.find(
    candidate => candidate.property?.key?.toLowerCase() === key,
  )

  if (!property) return null

  const value = getFPI18n(property, appCtx.getUserPreferences()).trim()
  return value && value !== '-' ? value : null
}

function loadDetailedFeatures(
  features: FeatureFromCollection[],
): Promise<FeatureFromCollection[]> {
  return Promise.all(
    features.map(async feature => {
      const response = await getFeature({
        ref: feature.id,
        refKey: 'id',
        meta: { profile: 'detail' },
      })

      return (response.data as FeatureFromCollection | null) ?? feature
    }),
  )
}

function slugifyHandle(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, '')

  return normalized || 'guest'
}

function getDemoProfileHref(name: string, platform: EventCompanionPlatform): string {
  const handle = slugifyHandle(name)

  if (platform === 'instagram') {
    return `https://instagram.com/${handle}`
  }

  if (platform === 'linkedin') {
    return `https://www.linkedin.com/in/${handle}`
  }

  if (platform === 'facebook') {
    return `https://www.facebook.com/${handle}`
  }

  return `https://${handle}.example.com`
}

function buildFollowLinks(
  featureId: string,
  role: EventCompanionRole,
  person: string | null,
): EventCompanionFollowAction[] {
  if (!person) return []

  const seed = `${featureId}:${role}:${person}`
  let hash = 0

  for (const char of seed) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  }

  const count = (hash % 3) + 1
  const startIndex = hash % platformSequence.length

  return Array.from({ length: count }, (_, index) => {
    const platform =
      platformSequence[(startIndex + index) % platformSequence.length] ?? 'web'

    return {
      href: getDemoProfileHref(person, platform),
      platform,
    }
  })
}

function buildBuyHref(feature: FeatureFromCollection): string {
  const title = getI18n(feature, 'title', appCtx.getUserPreferences(), feature.id)
  return `https://bookshop.org/search?keywords=${encodeURIComponent(title)}`
}

function toSessionCard(feature: FeatureFromCollection): EventCompanionSession {
  return {
    featureId: feature.id,
    title: getI18n(feature, 'title', appCtx.getUserPreferences(), feature.id),
    addressLine: getFirstAddressLine(feature),
    imageUrl: feature.image
      ? getURLfromImage({ image: feature.image as ImageContextEnvelope })
      : null,
    buyHref: buildBuyHref(feature),
    follows: {
      host: (() => {
        const label = getFeaturePropertyValue(feature, 'host')
        return label
          ? { label, actions: buildFollowLinks(feature.id, 'host', label) }
          : null
      })(),
      author: (() => {
        const label = getFeaturePropertyValue(feature, 'author')
        return label
          ? { label, actions: buildFollowLinks(feature.id, 'author', label) }
          : null
      })(),
      performer: (() => {
        const label = getFeaturePropertyValue(feature, 'performer')
        return label
          ? { label, actions: buildFollowLinks(feature.id, 'performer', label) }
          : null
      })(),
    },
  }
}

async function loadEventCompanionDemo(): Promise<void> {
  isLoading = true
  errorMessage = ''

  try {
    const layerResponses = await Promise.all(
      eventCompanionLayerIds.map(layerId =>
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
      errorMessage = 'Could not resolve the source layers for this leaflet.'
      sessionCards = []
      return
    }

    const latestLayer = [...layers].sort((left, right) => {
      return (
        getLayerYear(getLayerDisplayName(right)) -
        getLayerYear(getLayerDisplayName(left))
      )
    })[0]

    if (!latestLayer) {
      errorMessage = 'Could not determine the most recent event layer.'
      sessionCards = []
      return
    }

    const [projectResponse, featureResponse] = await Promise.all([
      getProject({
        ref: latestLayer.projectId,
        refKey: 'id',
        meta: { profile: 'detail' },
      }),
      getFeatures({
        conditions: {
          layerId: latestLayer.id,
          isArchived: false,
          isPublished: true,
        },
        pagination: {
          limit: 24,
        },
        meta: { profile: 'list' },
      }),
    ])

    const project = projectResponse.data as ProjectDetailProfile | null
    const projectName = project
      ? getI18n(project as never, 'name', appCtx.getUserPreferences(), 'Project')
      : 'Project'

    latestLayerName = getLayerDisplayName(latestLayer)
    sectionTitle = projectName
    projectImageUrl = project?.image
      ? getURLfromImage({ image: project.image as ImageContextEnvelope })
      : null
    upcomingEventsHref = `/layers/${latestLayer.id}`

    const features = (
      (featureResponse.data as FeatureFromCollection[] | undefined) ?? []
    ).filter(feature => {
      const title = getI18n(feature, 'title', appCtx.getUserPreferences(), '').trim()
      return Boolean(title) && Boolean(getFeaturePropertyValue(feature, 'host'))
    })

    const selectedFeatures = shuffleFeatures(features).slice(0, 4)
    const detailedFeatures = await loadDetailedFeatures(selectedFeatures)
    sessionCards = detailedFeatures.map(toSessionCard)
    sessionCountLabel = `${sessionCards.length} ${sessionCards.length === 1 ? 'session' : 'sessions'}`

    if (sessionCards.length === 0) {
      errorMessage = 'No hosted sessions are available for this demo leaflet yet.'
    }
  } catch (error) {
    console.error('Failed to load event companion panel', error)
    errorMessage = 'Unable to build the attendee leaflet right now.'
    projectImageUrl = null
    sessionCards = []
  } finally {
    isLoading = false
  }
}

onMount(() => {
  void loadEventCompanionDemo()
})
</script>

<Panel {...panelProps}>
  <Header {...panelProps} title={headerTitle} />

  <div class="bits-theme relative flex min-h-full flex-col bg-background-alt">
    <section
      class="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-accent)_16%,transparent),_transparent_34%),radial-gradient(circle_at_top_right,_color-mix(in_oklab,var(--color-primary)_12%,transparent),_transparent_32%),linear-gradient(180deg,#19161f_0%,#11141a_58%,#000000_100%)] px-4 py-4 text-foreground"
    >
      <div class="space-y-3">
        {#if projectImageUrl}
          <img
            src={projectImageUrl}
            alt={sectionTitle}
            class="float-right ml-4 h-18 w-18 rounded-2xl border border-white/10 object-cover"
            loading="lazy"
          >
        {:else}
          <div
            class="float-right ml-4 flex h-18 w-18 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent"
          >
            <CalendarHeartIcon class="h-7 w-7" />
          </div>
        {/if}

        <div class="min-w-0 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.35em] text-accent">
            {subtitle}
          </p>
          <h3 class="text-lg font-semibold leading-6 text-white">
            Thank you for attending.
          </h3>
          <p class="text-sm leading-6 text-white/72">
            Your personalised leaflet keeps recent sessions close at hand so you can
            revisit the books and follow the people behind them.
          </p>
        </div>

        <div class="clear-both flex items-center gap-2 pt-1">
          <div
            class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/72"
          >
            {latestLayerName}
          </div>
          <div
            class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/72"
          >
            {sessionCountLabel}
          </div>
          <div class="ml-auto">
            <Button
              text="Follow Events"
              iconComponent={CalendarHeartIcon}
              href={upcomingEventsHref}
              color="dark"
              style="soft"
              attrs={{ 'aria-label': 'Follow events' }}
            />
          </div>
        </div>
      </div>
    </section>

    {#if isLoading}
      <div
        class="flex flex-1 items-center justify-center px-6 py-12 text-sm text-muted-foreground"
      >
        Folding leaflet...
      </div>
    {:else if errorMessage}
      <div
        class="m-4 rounded-[var(--radius-card-lg)] border border-warning/30 bg-warning/10 px-4 py-5 text-sm leading-6 text-foreground-alt"
      >
        {errorMessage}
      </div>
    {:else}
      <section
        class="flex-1 bg-[linear-gradient(180deg,#050608_0%,#000000_100%)] px-3 py-4 pb-8 text-foreground"
      >
        <div class="space-y-4">
          {#each sessionCards as session (session.featureId)}
            <article
              class="overflow-hidden rounded-[var(--radius-card-lg)] border border-white/10 bg-background-alt shadow-[var(--shadow-card)]"
            >
              <div class="flex gap-3 border-b border-border-card px-3 py-3">
                <div
                  class="h-24 w-20 shrink-0 overflow-hidden rounded-[var(--radius-card-sm)] bg-muted"
                >
                  {#if session.imageUrl}
                    <img
                      src={session.imageUrl}
                      alt={session.title}
                      class="h-full w-full object-cover"
                      loading="lazy"
                    >
                  {:else if projectImageUrl}
                    <img
                      src={projectImageUrl}
                      alt={sectionTitle}
                      class="h-full w-full object-cover"
                      loading="lazy"
                    >
                  {:else}
                    <div
                      class="flex h-full w-full items-center justify-center bg-dark px-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-foreground"
                    >
                      Session
                    </div>
                  {/if}
                </div>

                <div class="min-w-0 flex-1">
                  <div class="float-right ml-3 mb-2">
                    <Button
                      text="Buy"
                      iconComponent={BookOpenIcon}
                      href={session.buyHref}
                      color="dark"
                      style="soft"
                      attrs={{
                        target: '_blank',
                        rel: 'noreferrer',
                        'aria-label': `Buy the book for ${session.title}`,
                      }}
                    />
                  </div>
                  {#if session.follows.author}
                    <p
                      class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                    >
                      {session.follows.author.label}
                    </p>
                  {/if}
                  <h4
                    class="line-clamp-2 text-sm font-semibold leading-5 text-foreground"
                  >
                    {session.title}
                  </h4>
                  <p class="mt-1 text-xs leading-5 text-foreground-alt">
                    {session.addressLine}
                  </p>
                  <div class="clear-both"></div>
                </div>
              </div>

              <div class="bg-black">
                <div class="">
                  {#each companionRoles as role}
                    <div class="px-4 py-2 border-1">
                      {#if session.follows[role]}
                        <div class="flex items-center gap-3">
                          <div class="min-w-0 flex-1">
                            <p
                              class="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45"
                            >
                              {role}
                            </p>
                            <p
                              class="mt-1 line-clamp-3 text-xs font-medium leading-5 text-white"
                            >
                              {session.follows[role]?.label}
                            </p>
                          </div>
                          <div class="flex shrink-0 flex-wrap justify-end gap-2">
                            {#each session.follows[role]?.actions ?? [] as follow, index}
                              <Button
                                text={platformMeta[follow.platform].label}
                                iconComponent={platformMeta[follow.platform].icon}
                                href={follow.href}
                                color={platformMeta[follow.platform].color}
                                style="soft"
                                size="sm"
                                modifier="square"
                                hideLabel={true}
                                attrs={{
                                  target: '_blank',
                                  rel: 'noreferrer',
                                  'aria-label': `Open ${role} link ${index + 1} on ${platformMeta[follow.platform].label}`,
                                }}
                              />
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <div class="flex items-center gap-3">
                          <div class="h-10 w-1 shrink-0 rounded-full bg-white/6"></div>
                          <div class="min-w-0 flex-1">
                            <p
                              class="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45"
                            >
                              {role}
                            </p>
                            <p
                              class="mt-1 line-clamp-3 text-xs leading-5 text-white/45"
                            >
                              No listing on this demo card.
                            </p>
                          </div>
                          <div
                            class="shrink-0 rounded-full border border-dashed border-border-card bg-background-alt px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                          >
                            Unavailable
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</Panel>
