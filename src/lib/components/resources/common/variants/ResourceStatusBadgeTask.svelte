<script lang="ts">
import { m } from '$lib/i18n';
import type { TaskType, Task, reviewActions, reviewOutcomes } from '$lib/types';

let {
  entity
}: {
  entity: Task;
} = $props();

const isReviewed = $derived(entity.isReviewed);
const type = $derived(entity.type);
const typeDisplay = $derived(
  {
    reportedMissing: m.noble_zany_crow_dance(),
    newPhoto: m.aware_sea_goose_nail(),
    newFeature: m.smart_crazy_cuckoo_play()
  }[type]
);
const reviewOutcome = $derived(entity.reviewOutcome);
const reviewOutcomeDisplay = $derived(
  reviewOutcome
    ? {
        rejected: 'Rejected',
        accepted: 'Accepted'
      }[reviewOutcome]
    : 'To Review'
);

let colorSuffix = $derived(
  reviewOutcome
    ? {
        rejected: 'glass-rejected',
        accepted: 'glass-accepted'
      }[reviewOutcome]
    : 'base-content/60'
);
</script>

<div class="tooltip" data-tip={entity.reviewReason || null}>
  <span
    class="badge w-[100px] rounded-lg border-none bg-glass-neutral px-3 py-5 text-xs uppercase text-{colorSuffix}">
    {reviewOutcomeDisplay}
  </span>
</div>
