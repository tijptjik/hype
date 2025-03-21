<script lang="ts">
import { signOut } from '@auth/sveltekit/client';
import { page } from '$app/stores';
import { m } from '$lib/i18n';
const { session } = $page.data;
</script>

<div
  class="relative flex w-full flex-col items-center bg-[url(/profileGlobe.svg)] bg-cover bg-center">
  <!-- Profile Content -->
  <div class="flex flex-col items-center gap-3 py-4">
    <!-- Avatar -->
    <div class="avatar">
      <div class="w-32 rounded-full ring ring-black/40">
        <img alt="Avatar" src={session?.user?.image} referrerpolicy="no-referrer" />
      </div>
    </div>

    <!-- User Name -->
    <div class="z-20 -mt-6 rounded-full bg-black/80 px-4 py-1">
      <span class="font-medium text-white">
        {session?.user?.name}
      </span>
    </div>

    <!-- Sign Out Button -->
    <button class="btn btn-sm uppercase" onclick={() => signOut()}>
      {m.navbar__signout()}
    </button>
  </div>
</div>
