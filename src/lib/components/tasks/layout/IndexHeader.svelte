<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// TYPES
import type { Project, Organisation } from '$lib/types';

type Props = {
  project: Project;
  organisation: Organisation;
};

// PROPS
let { project, organisation }: Props = $props();
</script>

<div
  class="z-20 flex w-full flex-row justify-between gap-8 bg-base-200 px-12 py-7 text-lg font-semibold">
  <h3 class="text-lg">
    {project.name}
    <small class="inline-block pl-3 text-sm text-base-content/50"
      ><span class="font-normal">by</span> {organisation.name}</small>
  </h3>
</div>
