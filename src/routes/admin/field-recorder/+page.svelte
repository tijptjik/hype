<script lang="ts">
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// BITS COMPONENTS
import RecorderSetup from '#lib/bits/patterns/fieldRecorder/RecorderSetup.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
const adminCtx = getAdminCtx()
adminCtx.setResourceType(false)
</script>
<Main.Root
  class="px-0"
  onDimensionsChange={(width, height) =>
    adminCtx.view.layout.setMainDimensions(width, height)}
>
  <Main.Content class="flex min-h-0 flex-1 flex-col overflow-y-auto pt-0!"
    ><RecorderSetup /></Main.Content
  >
</Main.Root>
