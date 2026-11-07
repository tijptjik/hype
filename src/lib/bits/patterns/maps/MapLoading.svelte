<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
</script>

<div
  role="status"
  aria-label={m.resource_loading()}
  data-map-loading
  class="bg-base-200 text-foreground/20 pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
>
  <MapIcon class="size-10" />
</div>
