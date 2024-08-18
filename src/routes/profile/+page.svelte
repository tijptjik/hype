<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';

const { data } = $props();
const { user } = data;

</script>

<div class="container mx-auto flex justify-center mt-24">
	<div class="card bg-white max-w-96 text-black shadow-xl">
		<div class="card-body">
			<h2 class="card-title">{user.name}</h2>
			<p>Registered with your Google account : {user.email}</p>
			<div class="card-actions justify-end">
				<button class="btn btn-secondary" on:click={() => signOut()}>Logout</button>
			</div>
		</div>
	</div>
</div>