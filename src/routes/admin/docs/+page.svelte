<script lang="ts">
// ICONS
import BookOpenIcon from 'virtual:icons/lucide/book-open'
// COMPONENTS
import LocationModelDocs from '#lib/bits/patterns/docs/LocationModelDocs.svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'

const admin = getAdminCtx()
const header = getHeaderCtrl()

admin.setResourceType(false)

$effect(() => {
  header.setHeaderForStandAlone('Docs', BookOpenIcon, {
    showNew: false,
    showFilter: false,
    showFacets: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  header.clearFooter()
})
</script>

<LocationModelDocs />
