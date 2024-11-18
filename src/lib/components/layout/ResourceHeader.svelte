<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { navItems } from '$lib/stores/navigation.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import type { ResourceNavProps } from '$lib/types';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';

// STATE : PROPS
let { resource, entity } : ResourceNavProps = $props();

let title = $derived(navItems[resource].name);
</script>

<header
  class="navbar h-17.5 px-12 py-4 shadow-lg {entity
    ? 'bg-gradient-to-r from-rose-500 to-fuchsia-800'
    : 'bg-base-300'}">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[resource].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title}</h2>
    </div>
  </div>
  <div class="flex-none flex items-center space-x-4">
    <NewEntityButton {resource} />
    <div class="divider divider-horizontal"></div>
    <FilterInput {resource} rounded={true} />
  </div>
</header>
