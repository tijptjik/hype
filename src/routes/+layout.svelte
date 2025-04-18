<script lang="ts">
// STORES
import { page } from '$app/stores';
// NAVIGATION
import { goto } from '$app/navigation';
import { afterNavigate } from '$app/navigation';
// QUERY
import { QueryClientProvider } from '@tanstack/svelte-query';
import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
// I18N
import { ParaglideJS } from '@inlang/paraglide-sveltekit';
import { m, i18n, languageTag, setLanguageTag } from '$lib/i18n';
// COMPONENTS
import FlashMessage from '$lib/components/common/FlashMessage.svelte';
// STYLES
import 'tailwindcss/tailwind.css';
// TYPES
import type { QueryClient } from '@tanstack/svelte-query';
import type { LayoutData } from './$types';

// PROPS
let { children } = $props();

// CONTEXT
const { queryClient } = $page.data as LayoutData & {
  queryClient: QueryClient;
};

// Set Page Metadata
let title = $state($page.data.title);
let site_name = $state($page.data.site_name);
let site_description = $state($page.data.site_description);
let socialImage = {
  image: '/favicon.png',
  width: '200',
  height: '200'
};

// Handle initial language setup and authentication
$effect(() => {
  const { session } = $page.data;

  // Handle authentication first
  if (!session) {
    // Only redirect if we're not already on the home page
    if ($page.url.pathname !== '/') {
      goto('/');
    }
    return;
  }

  // Then handle language
  if (session?.user?.language) {
    // Set the language tag first
    setLanguageTag(session.user.language);

    // Only redirect if we're not already on the correct language route
    const currentPath = $page.url.pathname;
    if (
      session.user.language !== 'en' &&
      !currentPath.startsWith(`/${session.user.language}`)
    ) {
      goto(`/${session.user.language}${currentPath}`);
    }
  }
});

afterNavigate(() => {
  title = $page.data.title;
  site_name = $page.data.site_name;
  site_description = $page.data.site_description;
});

function hideAddressBar() {
  if (!window.location.hash) {
    if (document.height < window.outerHeight) {
      document.body.style.height = window.outerHeight + 50 + 'px';
    }

    setTimeout(function () {
      window.scrollTo(0, 1);
    }, 50);
  }
}

window.addEventListener('load', function () {
  if (!window.pageYOffset) {
    hideAddressBar();
  }
});
window.addEventListener('orientationchange', hideAddressBar);

// Function to handle entering fullscreen
function enterFullscreen() {
  const element = document.documentElement;
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}

// Function to handle exiting fullscreen
function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

// Handle mobile devices
if (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
) {
  window.addEventListener('load', function () {
    // Try to enter fullscreen mode
    enterFullscreen();

    // Hide the address bar on page load
    setTimeout(function () {
      window.scrollTo(0, 1);
    }, 0);

    // Handle orientation changes
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        window.scrollTo(0, 1);
      }, 50);
    });

    // Handle resize events
    window.addEventListener('resize', function () {
      setTimeout(function () {
        window.scrollTo(0, 1);
      }, 50);
    });
  });

  // Handle visibility changes
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      enterFullscreen();
    }
  });
}
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
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Geologica:wght@100..900&display=swap"
    rel="stylesheet" />
</svelte:head>

<QueryClientProvider client={queryClient}>
  <ParaglideJS {i18n}>
    <div
      class="flex h-lvh w-dvw flex-row bg-black"
      class:font-hant={languageTag() === 'zh-hant'}
      class:font-hans={languageTag() === 'zh-hans'}>
      <FlashMessage />
      {@render children()}
      {#if languageTag() === 'zh-hant'}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@100..900&display=swap"
          rel="stylesheet" />
      {:else if languageTag() === 'zh-hans'}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap"
          rel="stylesheet" />
      {/if}
    </div>
    {#if import.meta.env.VITE_SVELTE_QUERY_DEVTOOLS === 'true'}
      <SvelteQueryDevtools />
    {/if}
  </ParaglideJS>
</QueryClientProvider>
