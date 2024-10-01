<script lang="ts">
import { ParaglideJS } from '@inlang/paraglide-sveltekit';
import { i18n } from '$lib/i18n';

import 'tailwindcss/tailwind.css';
import { page } from '$app/stores';
import { afterNavigate } from '$app/navigation';

// Props
let { children } = $props();

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

<ParaglideJS {i18n}>
  <div class="flex h-screen w-full flex-row">
    {@render children()}
  </div>
</ParaglideJS>
