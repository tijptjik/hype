<script lang="ts">
import AlertTriangleIcon from 'virtual:icons/lucide/triangle-alert'
import { m } from '$lib/i18n'

let {
  resourceLabel,
}: {
  resourceLabel: string
} = $props()
</script>

<div class="mx-2 flex w-full items-center gap-2 pb-4 caret-transparent">
  <AlertTriangleIcon class="h-10 w-10 shrink-0 text-error" />
  <span class="text-xl font-bold text-error">{m.funny_bright_lynx_grin()}</span>
  <span class="pl-4"
    >{m.admin__forms_remove_self_warning({ resource: resourceLabel })}</span
  >
</div>
