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

<div class="@container flex w-full flex-row gap-8 justify-between px-12 py-7 text-lg font-semibold bg-base-200 z-20">
  <h3 class="text-lg">
    {project.name}
    <small class="pl-3 text-sm text-base-content/50 inline-block"
      ><span class="font-normal">by</span> {organisation.name}</small>
  </h3>
</div>
