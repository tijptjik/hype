<script lang="ts">
import { page } from '$app/stores';
let data = $props<{ data: { message: string } }>();
let { message } = data;
</script>

<div class="flex h-screen w-full flex-col items-center justify-center">
    <div class="font-thin pb-8 text-6xl">
        <span class="align-middle text-neutral-500">{$page.status} |</span>
        <span class="text-2xl font-light align-middle ">{$page.error?.message}</span>
    </div>
    <a href="/" class="text-s btn btn-neutral btn-sm font-light mt-4">Go Home</a>
</div>
