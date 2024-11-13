<script lang="ts">
  import { getForm } from '$lib/context/forms.svelte';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { InformationCircle } from '@steeze-ui/heroicons';
  import { slide } from 'svelte/transition';

  // STATE
  let showInfo = $state(false);
  let panel: HTMLDivElement;

  function handleClickOutside(event: MouseEvent) {
    if (showInfo && panel && !panel.contains(event.target as Node)) {
      showInfo = false;
    }
  }

  $effect(() => {
    if (showInfo) {
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>


<div class="relative">
  <button 
    class="btn btn-ghost btn-rounded btn-sm p-1" 
    onclick={(e) => {
      e.stopPropagation();
      showInfo = !showInfo;
    }}
    aria-label="Toggle form information"
  >
    <Icon src={InformationCircle} class="h-4 w-4" />
  </button>

  {#if showInfo}
    <div 
      bind:this={panel}
      transition:slide={{ duration: 250 }}
      class="absolute z-50 right-1 top-14 w-[34rem] bg-base-100 border border-primary border-2 border-t-0 rounded-b-xl p-6 shadow-lg"
    >
      <div 
        class="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/10 to-transparent pointer-events-none"
        aria-hidden="true"
      />
      <div class="space-y-4 relative">
        <section>
          <h3 class="font-bold mb-2">Actions</h3>
          <p>The toggles control the public visibility of the feature:</p>
          <ul class="list-disc ml-6 space-y-2 mt-2">
            <li>
              <span class="font-semibold">ACCESSIBLE & OPEN TO PUBLIC</span> - Feature is shown on the map if its layer is active. Set true if, in ordinary circumstances, the feature is accessible to the public without restrictions or permission. If the feature is temporarily inaccessible, this should be false.
            </li>
            <li>
              <span class="font-semibold">INTANGIBLE FEATURE</span> - Feature may be shown on the map with the caveat that there is (no longer) a physical presence on site. This invites visitors to experience the feature's practical, historic context - e.g. sites of historic events; a striking contrast with the present; or a locality that is more salient than the missing materiality of the feature.
            </li>
          </ul>
          <p class="mt-2 text-sm italic">Note that is a feature is permanently unavailable AND there is no historic, intangible value to referencing the site, then it should simply to <u>unpublished</u> to delist it from all maps.</p>
        </section>

        <section>
          <h3 class="font-bold mb-2">Classification</h3>
          <p>Categorical dimensions along which the features can be filtered on the map. Fields are defined at the Collection level.</p>
        </section>

        <section>
          <h3 class="font-bold mb-2">Specification</h3>
          <p>Free-form text fields that provide additional context and references. Fields are defined at the Collection level.</p>
        </section>

        <section>
          <h3 class="font-bold mb-2">Map</h3>
          <p>Unlock the map by clicking on the top-right lock, then drag the map to relocate the feature marker.</p>
        </section>
      </div>
    </div>
  {/if}
</div>