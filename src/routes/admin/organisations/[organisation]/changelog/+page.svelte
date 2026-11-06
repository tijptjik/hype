<script lang="ts">
// SVELTE
import { page } from '$app/state'
// COMPONENTS
import AdminResourceChangelog from '#lib/bits/patterns/revisionHistory/AdminResourceChangelog.svelte'
</script>

<AdminResourceChangelog
  resource="organisation"
  resourceRef={page.params.organisation!}
/>
