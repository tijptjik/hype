<script lang="ts">
import AlertTriangleIcon from 'virtual:icons/proicons/alert-triangle'
import { m } from '#lib/i18n.js'
</script>

<div class="mx-2 flex w-full items-center gap-2 pb-4 caret-transparent">
  <AlertTriangleIcon class="text-error h-10 w-10 shrink-0" />
  <span class="text-error text-xl font-bold">{m.funny_bright_lynx_grin()}</span>
  <span class="pl-4">{m.admin__forms_hub_remove_organisation_warning()}</span>
</div>
