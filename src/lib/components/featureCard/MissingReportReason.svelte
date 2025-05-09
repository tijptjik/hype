<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';

// CONTEXT
const featureCardContext = getFeatureCardContext();
</script>

<div
  class="pointer-events-auto flex h-auto min-h-12 flex-shrink-0 basis-auto flex-col overflow-y-auto bg-black pb-3">
  <p
    class="bg-black px-3 pt-4 text-center font-bold uppercase tracking-wider text-neutral-400 w-100:px-6">
    {m.report_missing__preface()}
  </p>
  <ul
    class="line-height flex w-full list-inside list-disc flex-col justify-center gap-2 bg-black px-3 py-2 text-base-content md:px-6">
    <li class="px-3 pt-2">
      {m.report_missing__curatorial_review()}
    </li>
    <li class="px-3 pt-2">
      {m.report_missing__initial_instruction()}
    </li>
    <li class="px-3 pt-2">
      {m.report_missing__add_photo_instructions()}
    </li>
  </ul>

  <div class="pointer-events-auto bg-black px-3 pt-4 w-100:px-6">
    <textarea
      id="missing-reason"
      bind:value={featureCardContext.userData.missingReason}
      class="w-full rounded-md bg-gray-800 p-3 text-white focus:outline-none"
      rows="3"
      placeholder={m.report_missing__placeholder()}></textarea>
  </div>
</div>
