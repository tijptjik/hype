<script lang="ts">
import { untrack } from 'svelte'
import { useOmnibarModel } from '#lib/adapters/bars/useOmnibarModel.svelte.js'
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'

let {
  app,
  omni,
  onModel,
}: {
  app: AppCtx
  omni: OmniCtx
  onModel: (model: ReturnType<typeof useOmnibarModel>) => void
} = $props()
untrack(() =>
  onModel(useOmnibarModel(app, omni, { visibleWindowHeight: 700 } as ResponsiveCtx)),
)
</script>
