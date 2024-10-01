<script lang="ts">
import { page } from '$app/stores';
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';

// PROPS
let { children } = $props();

// STATE
let active = $derived(() => {
  const path = $page.url.pathname;
  const parts = path
    .replace(/^\/admin/, '')
    .split('/')
    .filter(Boolean);

  if (parts.length % 2 === 1) {
    return [parts[parts.length - 1]];
  } else if (parts.length >= 2) {
    return [parts[parts.length - 2], parts[parts.length - 1]];
  } else {
    return [];
  }
});

let selection = $derived(() => {
  const path = $page.url.pathname;
  const parts = path
    .replace(/^\/admin/, '')
    .split('/')
    .filter(Boolean);
  const newUrlParts: Record<string, boolean | string> = {
    organisations: false,
    projects: false,
    layers: false,
    features: false
  };

  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i] as keyof typeof newUrlParts;
    if (key in newUrlParts) {
      if (i === parts.length - 1) {
        newUrlParts[key] = true;
      } else {
        newUrlParts[key] = parts[i + 1] || false;
      }
    }
  }

  return newUrlParts;
});

let options = $state({});
let activeResource = $derived(() => {
  const path = $page.url.pathname;
  const resources = ['organisations', 'projects', 'layers', 'features'];
  return resources.find(resource => path.endsWith(`/${resource}/`)) || '';
});

// EFFECT
$effect(() => {
  if (activeResource) {
    fetchOptions(activeResource());
  } else {
    options = {};
  }
});

// FUNCTIONS
async function fetchOptions(resource: string) {
  if (resource) {
    try {
      const response = await fetch(`/api/${resource}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: { id: string; nameShort: string; name?: string; code?: string; properties?: { title: string } }[] =
        await response.json();
      options[resource] = data.map((item) => ({
        id: item.id,
        nameShort: item.properties?.title || item.nameShort || item.name || '',
        code: item.code || item.id
      }));
    } catch (error) {
      console.error(`Error fetching ${resource}:`, error);
      options = {};
    }
  }
}
</script>

<Sidebar {active} {selection} {options} />
<div class="flex w-full flex-col">
  <header class="w-full flex-none bg-black">
    <Navbar />
  </header>
  <main class="flex w-full flex-auto">
    {@render children()}
  </main>
</div>
