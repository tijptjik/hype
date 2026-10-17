<script lang="ts">
// CONTEXT
import { setSurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
// ADAPTERS
import { useResourcePanelModel } from '#lib/adapters/panels/useResourcePanelModel.svelte.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'
let {
  app,
  admin,
  onModel,
}: {
  app: ResourceViewCtx
  admin: AdminCtx
  onModel: (model: ResourcePanelModel) => void
} = $props()
setSurfaceNavigation(admin.navigation)
const model = useResourcePanelModel(app, 'admin', admin)
onModel(model)
</script>
