<script lang="ts">
// ADAPTERS
import { useResourcePanelModel } from '#lib/adapters/panels/useResourcePanelModel.svelte'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte'
import type { AdminCtx } from '#lib/context/admin.svelte'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types'
let {
  app,
  admin,
  onModel,
}: {
  app: AppCtx
  admin: AdminCtx
  onModel: (model: ResourcePanelModel) => void
} = $props()
const model = useResourcePanelModel(app, 'admin', admin)
onModel(model)
</script>
