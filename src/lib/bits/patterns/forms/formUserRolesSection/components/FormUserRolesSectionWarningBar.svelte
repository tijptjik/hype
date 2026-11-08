<script lang="ts">
import AlertTriangleIcon from 'virtual:icons/proicons/alert-triangle'
import { m } from '#lib/i18n.js'

let {
  resourceLabel,
}: {
  resourceLabel: string
} = $props()
</script>

<div
  role="status"
  class="border-error/35 bg-error/8 mx-6 my-3 flex items-center gap-3 rounded-lg border border-l-[3px] px-4 py-3 text-sm"
>
  <AlertTriangleIcon class="text-error size-7 shrink-0" />
  <div class="min-w-0">
    <p class="text-error font-semibold">{m.funny_bright_lynx_grin()}</p>
    <p class="text-foreground/80 mt-1">
      {m.admin__forms_remove_self_warning({ resource: resourceLabel })}
    </p>
  </div>
</div>
