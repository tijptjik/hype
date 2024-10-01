<script lang="ts">
import { goto } from '$app/navigation';
import { Icon } from '@steeze-ui/svelte-icon';
import {
  Bolt,
  Bars3BottomRight as Menu,
  Users,
  Squares2x2 as Projects,
  Square3Stack3d as Layers,
  MapPin,
  ChevronRight
} from '@steeze-ui/heroicons';

let {
  active,
  selection,
  options,
  isExpanded = true
} = $props<{
  active?: [string] | [string, string] | [];
  selection?: Record<string, null | string>;
  options?: Record<string, { id: string; nameShort: string; code: string }[]>;
  isExpanded?: boolean;
}>();

const toggleSidebar = () => {
  isExpanded = !isExpanded;
};

const routeToAdminPage = (route: string, replaceState: boolean = true) => {
  let url = '/admin';
  const sortedItems = menuItems.sort((a, b) => a.seq - b.seq);
  const lastSelectedSeq = Math.max(...sortedItems.filter(item => typeof selection[item.id] === 'string').map(item => item.seq), 0);
  
  let shouldAppendRoute = true;
  
  sortedItems.forEach(item => {
    if (selection[item.id] && typeof selection[item.id] === 'string') {
      url += `/${item.urlPart}/${selection[item.id]}`;
    } else if (item.urlPart === route) {
      if (item.seq < lastSelectedSeq) {
        url += `/${route}`;
      } else {
        shouldAppendRoute = false;
      }
    }
  });

  if (shouldAppendRoute) {
    goto(url, { replaceState });
  } else {
    goto(`/admin/${route}`, { replaceState });
  }
};

const menuItems = [
  { id: 'organisations', name: 'Organisations', icon: Users, seq: 1, urlPart: 'organisations' },
  { id: 'projects', name: 'Projects', icon: Projects, seq: 2, urlPart: 'projects' },
  { id: 'layers', name: 'Layers', icon: Layers, seq: 3, urlPart: 'layers' },
  { id: 'features', name: 'Features', icon: MapPin, seq: 4, urlPart: 'features' }
];
</script>

<aside
  class="h-screen bg-base-300 transition-all duration-300 ease-in-out {isExpanded
    ? 'w-96'
    : 'w-20'}">
  <div class="flex h-20 items-center justify-between bg-black p-4">
    {#if isExpanded}
      <div class="flex w-full items-center justify-center">
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
      <button class="btn btn-circle btn-ghost" onclick={toggleSidebar}>
        <Icon src={Menu} class="h-6 w-6" />
      </button>
    {:else}
      <div class="flex w-full items-center justify-center" onclick={toggleSidebar}>
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
    {/if}
  </div>

  <ul class="space-y-2 p-0">
    {#each menuItems as item}
      <li class="">
        <a
          href="/admin/{item.urlPart}"
          onclick={() => routeToAdminPage(item.urlPart)}
          class="flex items-center rounded-none p-6 {active()[0] == item.id
            ? 'border-l-4 border-primary'
            : ''}">
          <Icon src={item.icon} class="h-6 w-6" />
          {#if isExpanded}
            <span class="ml-3">{item.name}</span>
          {/if}
        </a>
        {#if isExpanded && options[item.id]}
          <ul class="divide-y divide-base-300 bg-base-100">
            {#each options[item.id] as subItem}
              <li>
                <a
                  href="/admin/{item.id}/{subItem.code}"
                  class="flex items-center border-l-4 border-base-300 p-4 pl-6 {selection()[
                    item.id
                  ] === subItem.id
                    ? 'border-secondary'
                    : ''}">
                  <Icon src={ChevronRight} class="h-5 w-5" />
                  <span class="ml-3 text-sm">
                    {subItem.nameShort}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</aside>
