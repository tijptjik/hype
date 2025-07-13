<script lang="ts">
// SVELTE
import { page } from '$app/state';
// I18N
import { m } from '$lib/i18n';
</script>

<div class="flex h-screen w-full flex-col items-center justify-center">
  <div class="pb-8 text-6xl font-thin">
    <span class="align-middle text-neutral-500">{page.status} |</span>
    <span class="align-middle text-2xl font-light">{@html page.error?.message}</span>
  </div>
  <a
    draggable="false"
    href="/"
    class="text-s btn btn-neutral btn-sm mt-4 select-none font-light">
    {m.http_404__go_home()}
  </a>
</div>
