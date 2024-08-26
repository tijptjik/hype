<script lang="ts">
import 'tailwindcss/tailwind.css';
import { signIn, signOut } from '@auth/sveltekit/client';
import { page } from '$app/stores';
import { afterNavigate } from '$app/navigation';

// Props
const { children } = $props();

// User Session
const { session } = $page.data;

// Set Page Metadata
let title = $state($page.data.title);
let site_name = $state($page.data.site_name);
let site_description = $state($page.data.site_description);
let socialImage = {
  image: '/favicon.png',
  width: '200',
  height: '200'
};

afterNavigate(() => {
  title = $page.data.title;
  site_name = $page.data.site_name;
  site_description = $page.data.site_description;
});
</script>

<svelte:head>
  <title>{title}</title>
  <meta property="og:site_name" content={site_name} />
  <meta property="og:type" content="article" />
  <meta name="description" content={site_description} />
  <meta property="og:description" content={site_description} />
  <meta name="twitter:description" content={site_description} />
  <meta property="og:title" content={title} />
  <meta property="og:image" content={socialImage.image} />
  <meta property="og:image:width" content={socialImage.width} />
  <meta property="og:image:height" content={socialImage.height} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:image" content={socialImage.image} />
</svelte:head>

<div class="flex h-screen w-full flex-col">
  <header class="w-full flex-none bg-white">
    <!-- Navbar -->
    <nav class="navbar bg-base-300">
      <!-- Menu for mobile -->
      <div class="flex w-full justify-between md:hidden">
        <!-- Logo -->
        <a href="/map" class="btn btn-ghost text-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
            ></path>
          </svg>
          GhostMapper
        </a>

        <div class="dropdown dropdown-end">
          <button class="btn btn-ghost">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              ></path>
            </svg>
          </button>
          <ul
            tabindex="0"
            class="menu dropdown-content z-[1] w-56 gap-2 rounded-box bg-base-200 p-6 shadow"
          >
            <li><a>Projects</a></li>
            <li><a>Hoods</a></li>
            <li><a>Blog</a></li>
            <li><a>About</a></li>
            <a onclick={() => signIn('google')} class="btn btn-primary btn-sm">
              <i class="fa-brands fa-space-awesome"></i>
              Login
            </a>
          </ul>
        </div>
      </div>

      <!-- Menu for desktop -->
      <div class="hidden w-full grid-cols-5 gap-2 md:grid">
        <!-- Left menu -->
        <ul class="menu col-span-2 hidden justify-start md:menu-horizontal">
          <li><a>Projects</a></li>
          <li><a>Hoods</a></li>
          <li><a>Blog</a></li>
        </ul>

        <!-- Centered logo -->
        <div class="flex justify-center">
          <a href="/map" class="btn btn-ghost text-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
              ></path>
            </svg>
            GhostMapper
          </a>
        </div>
        <!-- Logo -->
        <!-- Right menu -->
        <div class="menu col-span-2 hidden items-center justify-end gap-8 md:menu-horizontal">
          <div><a>About</a></div>
          {#if session}
            <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="avatar btn btn-circle btn-ghost">
                <div class="w-10 rounded-full">
                  <img alt="Avatar" src={session.user?.image} referrerpolicy="no-referrer" />
                </div>
              </div>
              <ul
                tabindex="0"
                class="menu dropdown-content menu-sm z-[1] mt-6 w-52 rounded-box bg-base-300 p-2 shadow"
              >
                <li>
                  <a href="/profile" class="justify-between">
                    Profile
                    <span class="badge">New</span>
                  </a>
                </li>
                <li><a>Settings</a></li>
                <li><a onclick={() => signOut()}>Logout</a></li>
              </ul>
            </div>
          {:else}
            <a class="btn btn-primary btn-sm" onclick={() => signIn('google')}>
              <svg
                class="-ml-1 mr-2 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                ></path>
              </svg>
              Login
            </a>
          {/if}
        </div>
      </div>
    </nav>
  </header>
  <main class="flex w-full flex-auto">
    {@render children()}
  </main>
</div>
