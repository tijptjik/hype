<script lang="ts">
import { untrack } from 'svelte'
import { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
let {
  app,
  onModel,
}: {
  app: ResourceViewCtx
  onModel: (model: ReturnType<typeof useFilterPanelModel>) => void
} = $props()
untrack(() => onModel(useFilterPanelModel(app, {} as OmniCtx, () => {})))
</script>
