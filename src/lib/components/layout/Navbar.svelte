<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import * as m from '$lib/paraglide/messages.js';
import { signIn, signOut } from '@auth/sveltekit/client';
import { hasControlPanelAccess } from '$lib/auth/utils';
import { goToResource } from '$lib/index';
// COMPONENTS
import { Bars3, ComputerDesktop, InboxArrowDown } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import IconicMenuButton from '$lib/components/menu/IconicMenuButton.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';

const { session } = $page.data;

let isMenuOpen = $state(false);
let notificationCount = $state(0);

// CONTEXT
const routerState = getRouterState();

$effect(() => {
  if (session && hasControlPanelAccess(session)) {
    let url = '/api/tasks?isReviewed=false';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        notificationCount = data.length;
      });
  }
});

const toggleMenu = () => {
  isMenuOpen = !isMenuOpen;
};

const pathsMenuRight = [
  { href: '/projects', label: m.navbar__projects() },
  { href: '/hoods', label: m.navbar__neighbourhoods() },
  { href: '/blog', label: m.navbar__blog() }
];

$effect(() => {
  isMenuOpen = false;
});

// HANDLERS
const handleClick = (e: MouseEvent, href: string, resource: boolean = false) => {
  e.preventDefault();
  e.stopPropagation();
  let url = new URL(window.location.href);
  url.pathname = href;
  routerState.updateWith({
    resource: resource,
    entity: false,
    facet: false
  });
  console.log('url', url.toString());
  goto(url.toString());
};
</script>

{#snippet navLink(href, label, className = '')}
  <a
    draggable="false"
    {href}
    onclick={(e) => handleClick(e, href, false)}
    class="select-none {className}"
    class:btn-active={$page.url.pathname.startsWith(href)}>
    {label}
  </a>
{/snippet}

{#snippet menuList(items)}
  <ul class="menu menu-horizontal space-x-2 p-0">
    {#each items as { href, label }}
      <li>
        {@render navLink(
          href,
          label,
          'btn btn-ghost rounded-none border-b-2 hover:bg-black hover:border-b-primary'
        )}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet adminControls()}
  {#if session && hasControlPanelAccess(session)}
    <ul class="menu menu-horizontal hidden space-x-2 p-0 lg:flex">
      <li>
        <IconicMenuButton
          href="/admin/tasks"
          handleClick={(e) => goToResource(e, routerState, 'task')}
          iconSrc={InboxArrowDown}
          matchFromStart={false}
          {notificationCount} />
      </li>
      <li>
        <IconicMenuButton
          href="/admin"
          iconSrc={ComputerDesktop}
          handleClick={() => handleClick(e, href)} />
      </li>
    </ul>
    <div class="mx-2 hidden h-5 w-px bg-neutral-800 lg:block"></div>
  {/if}
{/snippet}

{#snippet userMenu()}
  {#if session}
    <div class="dropdown dropdown-end h-12">
      <div tabindex="0" role="button" class="avatar btn btn-circle btn-ghost">
        <div class="w-10 rounded-full">
          <img alt="Avatar" src={session.user?.image} referrerpolicy="no-referrer" />
        </div>
      </div>
      <ul
        class="menu dropdown-content menu-sm z-[1] mt-6 w-52 rounded-box bg-base-300 p-2 shadow">
        {#if hasControlPanelAccess(session)}
          <div class="block lg:hidden">
            <li>
              {@render navLink('/admin', m.navbar__admin(), 'justify-between')}
            </li>
            <li>
              {@render navLink('/admin/tasks', m.navbar__tasks(), 'justify-between')}
            </li>
            <div class="divider"></div>
          </div>
        {/if}
        <li>
          {@render navLink('/profile', m.navbar__profile(), 'justify-between')}
        </li>
        <li class="lg:hidden">
          {@render navLink('/about', m.navbar__about(), 'justify-between')}
        </li>
        <li>
          <a draggable="false" onclick={() => signOut()} class="select-none">
            {m.navbar__signout()}
          </a>
        </li>
      </ul>
    </div>
  {:else}
    <a draggable="false" class="btn btn-primary" onclick={() => signIn('google')}>
      {m.navbar__signin()}
    </a>
  {/if}
{/snippet}

<nav class="navbar sticky top-0 z-10 bg-black px-6 py-4 shadow-md">
  <div class="navbar-start">
    <!-- Mobile Menu -->
    <div class="dropdown lg:hidden">
      <label tabindex="0" class="btn btn-ghost" onclick={toggleMenu}>
        <Icon src={Bars3} class="h-6 w-6" />
      </label>
      {#if isMenuOpen}
        <ul
          class="menu dropdown-content menu-sm z-[1] mt-3 w-52 rounded-box bg-base-100 p-2 shadow">
          {#each pathsMenuRight as { href, label }}
            <li>
              {@render navLink(href, label)}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <!-- Desktop Menu -->
    <div class="hidden lg:flex">
      {@render menuList(pathsMenuRight)}
    </div>
  </div>

  <div class="navbar-center">
    {@render navLink(
      '/',
      m.navbar__ghostmapper(),
      'btn btn-ghost text-2xl font-light bg-black'
    )}
  </div>

  <div class="navbar-end space-x-2">
    <ul class="menu menu-horizontal hidden space-x-2 p-0 lg:flex">
      {@render menuList([{ href: '/about', label: m.navbar__about() }])}
    </ul>
    <div class="mx-2 hidden h-5 w-px bg-neutral-800 lg:block"></div>
    {@render adminControls()}
    {@render userMenu()}
  </div>
</nav>
