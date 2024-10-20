<script lang="ts">
  import type { Component } from 'svelte';
  
  let { title, fields } : { title: string, fields: { name: string, label: string, component: Component }[] } = $props();
</script>

<div>
  <h2 class="text-lg font-bold">{title}</h2>
  <div class="flex flex-col gap-4">
    {#each fields as field}
      <div class="flex flex-col gap-2">
        <label for={field.name} class="text-sm font-medium text-gray-700">{field.label}</label>
        <input type="file" id={field.name} name={field.name} class="file-input file-input-bordered w-full max-w-xs" />
      </div>
    {/each}
  </div>
</div>