<script lang="ts">
import { signOut } from '@auth/sveltekit/client';

// eslint-disable-next-line no-undef
const { data } = $props();
const { user } = data;
</script>

<div class="container mx-auto mb-12 mt-24 flex justify-center">
  <div class="card max-h-72 min-h-32 max-w-96 bg-white text-black shadow-xl">
    <div class="card-body">
      <h2 class="card-title">{user.name}</h2>
      <p>Registered with your Google account : {user.email}</p>
      <div class="card-actions justify-end">
        <button class="btn btn-secondary" onclick={() => signOut()}>Logout</button>
      </div>
    </div>
  </div>
</div>
