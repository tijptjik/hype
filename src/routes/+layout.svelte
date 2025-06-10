<script lang="ts">
// SVELTE
import { watch } from 'runed';
// STORES
import { page } from '$app/state';
// NAVIGATION
import { goto } from '$app/navigation';
import { afterNavigate } from '$app/navigation';
// QUERY
import { QueryClientProvider } from '@tanstack/svelte-query';
import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
// AUTH
import { useSession } from '$lib/auth/client';
// I18N
import { getLocale, setLocale } from '$lib/i18n';
// COMPONENTS
import FlashMessage from '$lib/components/common/FlashMessage.svelte';
// STYLES
import 'tailwindcss/tailwind.css';
// TYPES
import type { QueryClient } from '@tanstack/svelte-query';
import type { LayoutData, LayoutProps } from './$types';
import type { Locale, SessionUser } from '$lib/types';

// PROPS
let { children, data }: LayoutProps = $props();

// CONTEXT
const { queryClient } = data as LayoutData & {
  queryClient: QueryClient;
};

const session = useSession();

// Set Page Metadata
let title = $state(page.data.title);
let site_name = $state(page.data.site_name);
let site_description = $state(page.data.site_description);
let socialImage = {
  image: '/favicon.png',
  width: '200',
  height: '200'
};

// Handle language setup from client-side session
watch(
  // Set locale from client session if available
  () => ($session.data?.user as SessionUser).locale,
  () => {
    const locale = getLocale();
    const userLocale = ($session.data?.user as SessionUser).locale;
    if (userLocale && locale !== userLocale) {
      setLocale(userLocale as Locale)
    }
  }
);

afterNavigate(() => {
  title = page.data.title;
  site_name = page.data.site_name;
  site_description = page.data.site_description;
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
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Geologica:wght@100..900&display=swap"
    rel="stylesheet" />
</svelte:head>

<QueryClientProvider client={queryClient}>
  <div
    class="flex h-lvh w-dvw flex-row overscroll-contain bg-black"
    class:font-hant={getLocale() === 'zh-hant'}
    class:font-hans={getLocale() === 'zh-hans'}>
    <FlashMessage />
    {@render children()}
    {#if getLocale() === 'zh-hant'}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@100..900&display=swap"
        rel="stylesheet" />
    {:else if getLocale() === 'zh-hans'}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap"
        rel="stylesheet" />
    {/if}
  </div>
  {#if import.meta.env.VITE_SVELTE_QUERY_DEVTOOLS === 'true'}
    <SvelteQueryDevtools />
  {/if}
</QueryClientProvider>
