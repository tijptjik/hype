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
// TYPES
import type { NavigableResource } from '#lib/types.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// ICONS
import Icon from 'virtual:icons/lucide/file-text'

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
let resource = $state<NavigableResource>(FirstClassResource.location)
const resources = [
  'location',
  'feature',
  'organisation',
  'project',
  'layer',
  'hub',
  'property',
  'user',
] as const
const model = useAdminHeaderModel(view, admin)
const props = $derived(model.getHeaderProps())
$effect(() => {
  admin.setResourceRef('fixture', resource)
  admin.setFacet('core', 'fixture', resource)
  header.setEditing(false)
  header.setHeaderForEntity(`Example ${resource}`, Icon, new Map([['core', 'Profile']]))
  header.setFormActions({
    canEdit: true,
    dirty: false,
    canPublish: resource !== 'location',
    showPublishAction: resource !== 'location',
    showDeleteAction: false,
    preview: resource === 'location' ? null : () => {},
    reset: () => header.setEditing(false),
    submit: () => {},
  })
})
onDestroy(() => view.dispose())
</script>
<div
  class="bits-theme bg-panel text-foreground min-h-screen"
  data-theme="breadline-light"
>
  <Header {...props} avatar={{ isVisible: false }} />
  <label class="block p-6"
    >Resource
    <select aria-label="Resource" bind:value={resource}>
      {#each resources as value}
        <option {value}>{value}</option>
      {/each}
    </select>
  </label>
  <p role="status">{resource}: {header.state.isEditing ? 'editing' : 'viewing'}</p>
</div>
