<script lang="ts">
import ResourceFeatureStatusBadge from '../../../components/ResourceFeatureStatusBadge.svelte'

let {
  isPublished,
  isPendingReview,
}: {
  isPublished: boolean
  isPendingReview: boolean
} = $props()
</script>

<div class="bits-resource-row__status">
  <ResourceFeatureStatusBadge {isPublished} {isPendingReview} />
</div>
