<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
// AUTH
import { canAccessAdminPanel } from '$lib/api/services/authz'
import { useSession } from '$lib/auth/client'
// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// COMPONENTS
import { AppMenu } from '$lib/bits/patterns/bars/appMenu'
import PlusCircleIcon from 'virtual:icons/lucide/circle-plus'
import FunnelIcon from 'virtual:icons/lucide/filter'
import InformationCircleIcon from 'virtual:icons/lucide/info'
import MapIcon from 'virtual:icons/lucide/map'
import MonitorIcon from 'virtual:icons/lucide/monitor'
import NewspaperIcon from 'virtual:icons/lucide/newspaper'
import SettingsIcon from 'virtual:icons/lucide/settings'
import StarIcon from 'virtual:icons/lucide/star'
// TYPES
import type { AppMenuItem } from '$lib/bits/patterns/bars/appMenu'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

type AppNavProps = {
  hub: HubOptsExtended
  subscriptionItem?: {
    isVisible: boolean
    label: string
    onSelect: () => void | Promise<void>
  }
}

let { hub, subscriptionItem }: AppNavProps = $props()

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const session = useSession()
const ADD_FEATURE_MENU_VALUE = 'addFeature'
const SUBSCRIPTION_MENU_VALUE = 'subscribe'
type AppNavMenuValue =
  | Panel
  | typeof ADD_FEATURE_MENU_VALUE
  | typeof SUBSCRIPTION_MENU_VALUE

const items = $derived<AppMenuItem<Panel>[]>(
  hub.isCore
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
const offsetX = $derived(responsiveCtx.getAppMainOffsetX())

async function handleSelect(
  item: AppMenuItem<AppNavMenuValue>,
  event: MouseEvent,
): Promise<void> {
  if (item.value === ADD_FEATURE_MENU_VALUE) {
    await initAddNewFeature(appCtx, omniCtx, event)
    return
  }

  if (item.value === Panel.admin) {
    const currentPath = page.url.pathname

    if (currentPath.startsWith('/features/')) {
      goto(`/admin${currentPath}`)
      return
    }

    goto('/admin/tasks')
    return
  }

  if (item.value === SUBSCRIPTION_MENU_VALUE) {
    await subscriptionItem?.onSelect?.()
    return
  }

  appCtx.togglePanel(item.value)
}
</script>

<AppMenu {items} {trailingItems} {offsetX} onSelect={handleSelect} />
