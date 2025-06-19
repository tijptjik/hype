<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
// COMPONENTS
import AdminControls from '$lib/components/menu/AdminControls.svelte';
import UserMenu from '$lib/components/menu/UserMenu.svelte';
</script>

<nav class="navbar sticky top-0 z-10 bg-black px-6 py-4 caret-transparent shadow-md">
  <div class="navbar-start">
    <div class="flex"></div>
  </div>

  <div class="navbar-center caret-transparent">
    <a
      href={ADMIN_PATH}
      class="btn btn-ghost bg-black text-2xl font-light"
      draggable="false">
      {m.navbar__ghostmapper()}
    </a>
  </div>

  <div class="navbar-end space-x-2 caret-transparent">
    <AdminControls />
    <div class="mx-2 h-5 w-px bg-neutral-800"></div>
    <UserMenu />
  </div>
</nav>
