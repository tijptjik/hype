<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
// AUTH
import { canAccessAdminPanel } from '#lib/api/services/authz/user.js'
import { useSession } from '#lib/auth/client.js'
import { requestAccountUpgrade } from '#lib/auth/upgrade.js'
// SERVICES
import { initAddNewFeature } from '#lib/client/services/feature.js'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
import {
  getSurfaceLayoutCtx,
  SurfaceLayout,
} from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// COMPONENTS
import { AppMenu } from '#lib/bits/patterns/bars/appMenu/index.js'
import PlusCircleIcon from 'virtual:icons/proicons/add-circle'
import FunnelIcon from 'virtual:icons/proicons/filter'
import InformationCircleIcon from 'virtual:icons/proicons/info'
import MapIcon from 'virtual:icons/proicons/map'
import StationIcon from 'virtual:icons/tabler/train'
import RouteIcon from 'virtual:icons/lucide/route'
import StationMapTools from '#lib/bits/patterns/station/StationMapTools.svelte'
import MonitorIcon from 'virtual:icons/proicons/computer'
import NewspaperIcon from 'virtual:icons/proicons/file-text'
import SettingsIcon from 'virtual:icons/proicons/settings'
import StarIcon from 'virtual:icons/proicons/star'
// TYPES
import type { AppMenuItem } from '#lib/bits/patterns/bars/appMenu/index.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

type AppNavProps = {
  getMapCenter?: () => [number, number] | null
  hub: HubOptsExtended
  subscriptionItem?: {
    isVisible: boolean
    label: string
    onSelect: () => void | Promise<void>
  }
}

let { hub, subscriptionItem, getMapCenter }: AppNavProps = $props()

const publicApp = getAppCtx()
const station = publicApp.station
const appCtx = getSurfaceCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = getSurfaceLayoutCtx() ?? new SurfaceLayout(responsiveCtx)
const session = useSession()
const ADD_FEATURE_MENU_VALUE = 'addFeature'
const SUBSCRIPTION_MENU_VALUE = 'subscribe'
const STATION_MENU_VALUE = 'station'
const ROUTE_MENU_VALUE = 'stationRoute'
let routeOpen = $state(false)
const canPreviewRoute = $derived(
  appCtx.isSuperAdmin() &&
    station.active &&
    Boolean(station.data) &&
    station.data?.coordinateSpace !== 'image-pixels',
)
$effect(() => {
  if (!canPreviewRoute || station.loading) routeOpen = false
})
// Retain map-dependent navigation through station loads, then adopt the completed venue.
let hasStationMap = $state(false)
$effect(() => {
  if (!station.active) hasStationMap = false
  else if (!station.loading && !station.error) hasStationMap = Boolean(station.data)
})
type AppNavMenuValue =
  | Panel
  | typeof STATION_MENU_VALUE
  | typeof ROUTE_MENU_VALUE
  | typeof ADD_FEATURE_MENU_VALUE
  | typeof SUBSCRIPTION_MENU_VALUE

const items = $derived<AppMenuItem<AppNavMenuValue>[]>(
  station.active
    ? [
        { value: Panel.prisms, icon: StationIcon, label: 'Station' },
        { value: STATION_MENU_VALUE, icon: MapIcon, label: 'Surroundings' },
        ...(hasStationMap && canPreviewRoute
          ? ([
              { value: ROUTE_MENU_VALUE, icon: RouteIcon, label: 'Route' },
            ] satisfies AppMenuItem<AppNavMenuValue>[])
          : []),
        { value: Panel.settings, icon: SettingsIcon, label: m.menu_settings() },
      ]
    : hub.isCore
      ? [
          { value: Panel.prisms, icon: MapIcon, label: m.maps__title() },
          { value: Panel.filters, icon: FunnelIcon, label: m.menu_filters() },
          { value: Panel.stars, icon: StarIcon, label: m.menu_stars() },
          { value: Panel.settings, icon: SettingsIcon, label: m.menu_settings() },
        ]
      : [
          { value: Panel.hub, icon: InformationCircleIcon, label: m.menu_about() },
          { value: Panel.filters, icon: FunnelIcon, label: m.menu_filters() },
          { value: Panel.stars, icon: StarIcon, label: m.menu_stars() },
          { value: Panel.settings, icon: SettingsIcon, label: m.menu_settings() },
        ],
)
const showAdminMenu = $derived.by(
  () =>
    !responsiveCtx.isMobile &&
    canAccessAdminPanel({
      superAdmin: $session?.data?.user?.superAdmin,
      userRoles: $session?.data?.user?.roles ?? [],
    }),
)
const isContributorAddVisible = $derived(
  Boolean(
    responsiveCtx.isMobile && $session?.data?.user?.experimental?.contributorMode,
  ),
)
const trailingItems = $derived<AppMenuItem<AppNavMenuValue>[]>([
  ...(isContributorAddVisible
    ? [
        {
          value: ADD_FEATURE_MENU_VALUE,
          color: 'accent',
          icon: PlusCircleIcon,
          isMobileVisible: true,
          label: m.whole_house_cougar_hurl_menu(),
        } satisfies AppMenuItem<AppNavMenuValue>,
      ]
    : []),
  ...(showAdminMenu
    ? [
        {
          value: Panel.admin,
          icon: MonitorIcon,
          label: m.menu_admin(),
          tone: 'secondary',
        } satisfies AppMenuItem<AppNavMenuValue>,
      ]
    : []),
  ...(subscriptionItem?.isVisible
    ? [
        {
          value: SUBSCRIPTION_MENU_VALUE,
          icon: NewspaperIcon,
          label: subscriptionItem.label,
          tone: 'secondary',
          isMobileVisible: true,
        } satisfies AppMenuItem<AppNavMenuValue>,
      ]
    : []),
])
const offsetX = $derived(surfaceLayout.getAppMainOffsetX())

async function handleSelect(
  item: AppMenuItem<AppNavMenuValue>,
  event: MouseEvent,
): Promise<void> {
  if (item.value !== ROUTE_MENU_VALUE) routeOpen = false
  if (item.value === STATION_MENU_VALUE) {
    station.close()
    return
  }
  if (item.value === ROUTE_MENU_VALUE) {
    if (!canPreviewRoute || station.loading) return
    routeOpen = !routeOpen
    return
  }
  if (item.value === ADD_FEATURE_MENU_VALUE) {
    if ($session.data?.user?.isAnonymous === true) {
      requestAccountUpgrade('contribution', page.url.href)
      return
    }
    await initAddNewFeature(appCtx, omniCtx, event, { getMapCenter })
    return
  }

  if (item.value === Panel.admin) {
    const currentPath = page.url.pathname

    if (currentPath.startsWith('/features/')) {
      goto(`/admin${currentPath}`)
      return
    }

    goto('/admin/features')
    return
  }

  if (item.value === SUBSCRIPTION_MENU_VALUE) {
    if ($session.data?.user?.isAnonymous === true) {
      requestAccountUpgrade('subscription', page.url.href)
      return
    }
    await subscriptionItem?.onSelect?.()
    return
  }

  appCtx.panels.togglePanel(item.value)
}
</script>

<AppMenu {items} {trailingItems} {offsetX} onSelect={handleSelect} />

{#if canPreviewRoute}
  <StationMapTools bind:open={routeOpen} {offsetX} />
{/if}
