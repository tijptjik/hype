<script lang="ts">
import type { SectionProps, FormField } from '$lib/types';
import Dropzone from 'svelte-file-dropzone';

let sectionProps: SectionProps = $props();
let { title, fields } = sectionProps;

let files = $state({
  accepted: [],
  rejected: []
});

function handleFilesSelect(e: CustomEvent) {
  const { acceptedFiles, fileRejections } = e.detail;
  console.log(acceptedFiles, fileRejections);
  files.accepted = [...files.accepted, ...acceptedFiles];
  files.rejected = [...files.rejected, ...fileRejections];
}
</script>

<div>
  <h2 class="text-lg font-bold">{title}</h2>
  <div class="flex flex-wrap gap-4">
    {#each Object.entries(fields as FormField) as [fieldRoot, field]}
      <div class="flex flex-col gap-2">
        <label for={fieldRoot} class="text-sm font-medium text-gray-700"
          >{field.label}</label>
        <Dropzone on:drop={handleFilesSelect} />
        <ol>
          {#each files.accepted as item}
            <li>{item.name}</li>
          {/each}
        </ol>
      </div>
    {/each}
  </div>
</div>
