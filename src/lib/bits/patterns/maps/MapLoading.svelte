<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
</script>

<div
  role="status"
  aria-label={m.resource_loading()}
  data-map-loading
  class="bg-base-200 pointer-events-none absolute inset-0 overflow-hidden"
></div>
