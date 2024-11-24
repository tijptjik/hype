<script lang="ts">
import { page } from '$app/stores';
import * as m from '$lib/paraglide/messages.js';
import { signIn, signOut } from '@auth/sveltekit/client';
import { hasControlPanelAccess } from '$lib/auth/utils';
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
import { ComputerDesktop, InboxArrowDown } from '@steeze-ui/heroicons';
import IconicMenuButton from '$lib/components/menu/IconicMenuButton.svelte';

const { session } = $page.data;

let isMenuOpen = $state(false);

const toggleMenu = () => {
  isMenuOpen = !isMenuOpen;
};

const pathsMenuRight = [
  { href: '/projects', label: m.navbar__projects() },
  { href: '/hoods', label: m.navbar__neighbourhoods() },
  { href: '/blog', label: m.navbar__blog() }
];

$effect(() => {
  // Close menu when route changes
  isMenuOpen = false;
});
</script>

<nav class="navbar sticky top-0 z-10 bg-black px-6 py-4 shadow-md">
  <div class="navbar-start">
    <div class="dropdown lg:hidden">
      <label tabindex="0" class="btn btn-ghost" onclick={toggleMenu}>
        <Icon src={Bars3} class="h-6 w-6" />
      </label>
      {#if isMenuOpen}
        <ul
          tabindex="0"
          class="menu dropdown-content menu-sm z-[1] mt-3 w-52 rounded-box bg-base-100 p-2 shadow">
          {#each pathsMenuRight as { href, label }}
            <li>
              <a
                draggable="false"
                {href}
                class:select-none active={$page.url.pathname.startsWith(href)}>{label}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="hidden lg:flex">
      <ul class="menu menu-horizontal space-x-2 p-0">
        {#each pathsMenuRight as { href, label }}
          <li>
            <a
              draggable="false"
              {href}
              class="btn btn-ghost select-none"
              class:btn-active={$page.url.pathname.startsWith(href)}>
              {label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="navbar-center">
    <a
      draggable="false"
      href="/"
      class="btn btn-ghost text-2xl font-light hover:bg-black select-none">
      {m.navbar__ghostmapper()}
    </a>
  </div>

  <div class="navbar-end space-x-2">
    <ul class="hidden lg:flex menu menu-horizontal space-x-2 p-0 ">
      <li>
        <a
          draggable="false"
          href="/about"
          class="btn btn-ghost select-none"
          class:btn-active={$page.url.pathname === '/about'}>
          {m.navbar__about()}
        </a>
      </li>
    </ul>
    <div class="hidden lg:block h-5 w-px bg-neutral-800 mx-2"></div>
    {#if session && hasControlPanelAccess(session)}
    <ul class="hidden lg:flex menu menu-horizontal space-x-2 p-0 ">
          <li>
            <IconicMenuButton href="/reviewQueue" iconSrc={InboxArrowDown} matchFromStart={false} notificationCount={7} />
          </li>
          <li>
            <IconicMenuButton href="/admin" iconSrc={ComputerDesktop} />
          </li>
      </ul>
      <div class="hidden lg:block h-5 w-px bg-neutral-800 mx-2"></div>
    {/if}
    {#if session}
      <div class="dropdown dropdown-end h-12">
        <div tabindex="0" role="button" class="avatar btn btn-circle btn-ghost">
          <div class="w-10 rounded-full">
            <img alt="Avatar" src={session.user?.image} referrerpolicy="no-referrer" />
          </div>
        </div>
        <ul
          tabindex="0"
          class="menu dropdown-content menu-sm z-[1] mt-6 w-52 rounded-box bg-base-300 p-2 shadow">
          <li>
            <a
              draggable="false"
              href="/profile"
              class="justify-between select-none">
              {m.navbar__profile()}
              <span class="badge">{m.navbar__new()}</span>
            </a>
          </li>
          <li class="lg:hidden">
            <a
              draggable="false"
              href="/about"
              class="justify-between select-none">
              {m.navbar__about()}
            </a>
          </li>
          <li>
            <a
              draggable="false"
              onclick={() => signOut()}
              class="select-none">{m.navbar__signout()}</a>
          </li>
        </ul>
      </div>
    {:else}
      <a
        draggable="false"
        class="btn btn-primary"
        onclick={() => signIn('google')}>
        {m.navbar__signin()}
      </a>
    {/if}
  </div>
</nav>
