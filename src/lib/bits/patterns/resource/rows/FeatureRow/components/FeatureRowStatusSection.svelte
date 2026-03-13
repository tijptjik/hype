<script lang="ts">
import ResourceStatusBadge from '$lib/components/resources/common/ResourceStatusBadge.svelte'

let {
  isPublished,
  isPendingReview,
}: {
  isPublished: boolean
  isPendingReview: boolean
} = $props()
</script>

<div class="bits-resource-row__status">
  <ResourceStatusBadge {isPublished} {isPendingReview} />
</div>
