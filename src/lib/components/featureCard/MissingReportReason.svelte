<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';

// CONTEXT
const featureCardContext = getFeatureCardContext();
</script>

<div class="pointer-events-auto bg-black px-6 pt-4">
  <label for="missing-reason" class="mb-2 block font-medium text-white">
    {m.report_missing__label()}
  </label>
  <textarea
    id="missing-reason"
    bind:value={featureCardContext.userData.missingReason}
    class="w-full rounded-md bg-gray-800 p-4 text-white focus:outline-none"
    rows="3"
    placeholder={m.report_missing__placeholder()}></textarea>
</div>
