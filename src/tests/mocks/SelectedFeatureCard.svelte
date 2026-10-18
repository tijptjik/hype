<script lang="ts">
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
let { feature }: { feature: Feature } = $props()
</script>

<article data-testid="selected-feature" data-feature-id={feature.id}>
  {feature.i18n?.en?.title}
</article>
