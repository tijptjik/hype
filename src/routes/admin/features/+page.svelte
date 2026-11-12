<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { page } from '$app/state'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { createDefaultViewFilters } from '#lib/context/resourceFilters.svelte.js'
// BITS COMPONENTS
import AdminFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/AdminFeatureIndex.svelte'

const adminCtx = getAdminCtx()

// A saved research session opens a clean overview; unrelated retained filters cannot hide its drafts.
$effect(() => {
  const origin = page.url.searchParams.get('origin')
  const originId = page.url.searchParams.get('originId')
  if (origin !== 'field_research' || !originId) return
  untrack(() => {
    adminCtx.view.filters.viewFilters.feature = {
      ...createDefaultViewFilters().feature,
      origin,
      originId,
    }
    adminCtx.view.filters.values.feature.text = ''
    adminCtx.view.scope.prisms = { organisation: [], project: [], layer: [] }
    adminCtx.listUi.state.isControlBarVisible.feature = true
  })
})
</script>

<AdminFeatureIndex />
