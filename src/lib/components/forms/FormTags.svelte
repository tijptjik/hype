<script lang="ts">
import Tags from 'svelte-tags-input';

type Props = {
  tags: string[];
};

let { tags = $bindable() }: Props = $props();
let tagsArray = $derived(tags);

function onTagAdded(tag: string, tagsArray: string[]) {
  tags = tagsArray;
}
function onTagRemoved(tag: string, tagsArray: string[]) {
  tags = tagsArray;
}

</script>

<style>
.tags-field :global(.svelte-tags-input-tag) {
  @apply bg-accent border-none focus:outline-none focus:border-none hover:bg-accent rounded-md mb-1 mr-2 font-mono px-2
}

.tags-field :global(.svelte-tags-input-layout) {
  @apply bg-neutral border-none focus:outline-none focus:border-none  hover:border-none pt-1 pb-2
}

</style>

<div class="tags-field bg-neutral border-none focus:outline-none">
  <Tags
  tags={tagsArray}
  placeholder={tagsArray?.length > 0 ? "" : "Add all valid options"}
  {onTagAdded}
  {onTagRemoved}
  />
</div>