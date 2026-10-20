<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import PublishChildrenDialog from '#lib/bits/patterns/resource/PublishChildrenDialog.svelte'
let {
  resourceType = 'organisation',
  onChoice,
  onCancel,
}: {
  resourceType?: 'organisation' | 'project' | 'layer'
  onChoice: (publishChildren: boolean) => void | Promise<void>
  onCancel: () => void
} = $props()
setResponsiveCtx()
</script>
<PublishChildrenDialog {resourceType} {onChoice} {onCancel} />
