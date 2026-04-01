<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
// AUTH
import { canAccessAdminPanel } from '$lib/api/services/authz'
import { useSession } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// COMPONENTS
import { AppMenu } from '$lib/bits/patterns/bars/appMenu'
import FunnelIcon from 'virtual:icons/lucide/filter'
import InformationCircleIcon from 'virtual:icons/lucide/info'
import MapIcon from 'virtual:icons/lucide/map'
import MonitorIcon from 'virtual:icons/lucide/monitor'
import SettingsIcon from 'virtual:icons/lucide/settings'
import StarIcon from 'virtual:icons/lucide/star'
// TYPES
import type { AppMenuItem } from '$lib/bits/patterns/bars/appMenu'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

type AppNavProps = {
  hub: HubOptsExtended
}

let { hub }: AppNavProps = $props()

const appCtx = getAppCtx()
const session = useSession()

const showAdminMenu = $derived.by(() =>
  canAccessAdminPanel({
    superAdmin: $session?.data?.user?.superAdmin,
    userRoles: $session?.data?.user?.roles ?? [],
  }),
)
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
const trailingItems = $derived<AppMenuItem<Panel>[]>(
  showAdminMenu
    ? [
        {
          value: Panel.admin,
          icon: MonitorIcon,
          label: m.menu_admin(),
          tone: 'secondary',
        },
      ]
    : [],
)
const offsetX = $derived(appCtx.getHorizontalOffset())

function handleSelect(item: AppMenuItem<Panel>): void {
  if (item.value === Panel.admin) {
    const currentPath = page.url.pathname

    if (currentPath.startsWith('/features/')) {
      goto(`/admin${currentPath}`)
      return
    }

    goto('/admin/tasks')
    return
  }

  appCtx.togglePanel(item.value)
}
</script>

<AppMenu {items} {trailingItems} {offsetX} onSelect={handleSelect} />
