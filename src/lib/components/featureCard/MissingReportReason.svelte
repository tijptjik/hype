<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';

// CONTEXT
const featureCardContext = getFeatureCardContext();
</script>

<p class="bg-black px-3 pt-2 text-sm text-base-content w-100:px-6">
  {m.report_missing__preface()}
</p>
<div class="pointer-events-auto bg-black px-3 pt-4 w-100:px-6">
  <!-- <label for="missing-reason" class="mb-2 block font-medium text-white"> -->
  <!-- {m.report_missing__label()} -->
  <!-- </label> -->
  <textarea
    id="missing-reason"
    bind:value={featureCardContext.userData.missingReason}
    class="w-full rounded-md bg-gray-800 p-3 text-white focus:outline-none"
    rows="3"
    placeholder={m.report_missing__placeholder()}></textarea>
</div>
