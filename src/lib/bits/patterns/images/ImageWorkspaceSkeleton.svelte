<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// I18N
import { m } from '#lib/i18n.js'
</script>

<div
  class="relative flex h-full min-h-0 w-full overflow-hidden"
  role="status"
  aria-busy="true"
  aria-label={m.resource_loading()}
>
  <Skeleton class="h-full min-h-0 w-full rounded-none" />
</div>
