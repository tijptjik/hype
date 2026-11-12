<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
// ADAPTER
import { useAdminHeaderModel } from '#lib/adapters/header/useAdminHeaderModel.svelte.js'
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { FacetType } from '#lib/context/facets.js'
// ICONS
import ShareIcon from 'virtual:icons/proicons/share'
import Icon from 'virtual:icons/lucide/clock'

const responsive = setResponsiveCtx()
setRootCTX(responsive)
const view = setSurfaceCtx(
  new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    responsive,
    undefined,
    'admin',
  ),
)
const admin = setAdminCtx(view)
const header = setHeaderCtrl()
admin.setResourceRef('fixture', FirstClassResource.organisation)
header.setHeaderForEntity(
  'Header transitions',
  Icon,
  new Map([
    ['core', { label: 'Profile', icon: Icon }],
    ['users', { label: 'Users', icon: Icon }],
    ['updates', { label: 'History', icon: Icon }],
  ]),
)
const model = useAdminHeaderModel(view, admin)
let active = $state<FacetType>('features')
let pending = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined
/** Simulate route cleanup followed by a delayed child index registration.
 * @param facet Destination read-only tab.
 * @returns Nothing.
 */
function select(facet: FacetType): void {
  clearTimeout(timer)
  active = facet
  admin.setFacet(facet, 'fixture', FirstClassResource.organisation)
  header.setSearch(null)
  header.setViewActions([])
  pending = true
  timer = setTimeout(() => {
    if (facet === 'features' || facet === 'users')
      header.setSearch({
        indexView: true,
        resourceType:
          facet === 'features' ? FirstClassResource.feature : FirstClassResource.user,
        query: '',
        onFilter: () => {},
      })
    if (facet === 'updates')
      header.setViewActions([
        { id: 'history-refresh', text: 'Refresh', icon: Icon },
        { id: 'history-expand', text: 'Expand all', icon: Icon },
      ])
    pending = false
  }, 350)
}
select('features')
const base = $derived(model.getHeaderProps())
const sharing = $derived(active === 'share')
onDestroy(() => {
  clearTimeout(timer)
  view.dispose()
})
</script>

<div
  class="bits-theme bg-panel text-foreground min-h-screen"
  data-theme="breadline-light"
>
  <Header
    {...base}
    title={{ text: 'Header transitions' }}
    shareAction={{ text: 'Share map', icon: ShareIcon, onClick: () => select('share') }}
    filter={{ ...base.filter, isFilterable: !sharing && base.filter?.isFilterable }}
    viewActions={{
      ...base.viewActions,
      isVisible: !sharing && base.viewActions?.isVisible,
    }}
    formActions={{
      ...base.formActions,
      isVisible: false,
      featuresAction: {
        ...base.formActions?.featuresAction,
        text: 'Features',
        onClick: () => select('features'),
      },
      usersAction: {
        ...base.formActions?.usersAction,
        text: 'Users',
        onClick: () => select('users'),
      },
      historyAction: {
        ...base.formActions?.historyAction,
        text: 'History',
        onClick: () => select('updates'),
      },
    }}
  />
  <p class="p-4" role="status">{active} — {pending ? 'loading controls' : 'ready'}</p>
</div>
