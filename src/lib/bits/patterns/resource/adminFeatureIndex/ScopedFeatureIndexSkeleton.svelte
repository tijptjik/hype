<script lang="ts">
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// COMPONENTS
import ResourceLoadingState from '../resourceIndex/components/ResourceLoadingState.svelte'
const admin = getAdminCtx()
</script>

<div
  class="bits-theme flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  data-scoped-feature-skeleton
>
  <ResourceLoadingState
    isRowLayout={admin.listUi.state.layoutMode.feature !== 'card'}
  />
</div>
