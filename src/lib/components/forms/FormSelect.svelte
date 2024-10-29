<script lang="ts">
    import Labels from './FormInputLabels.svelte';
    // TYPES
    import type { InputConstraints, InputConstraint } from 'sveltekit-superforms';
    
    // PROPS
    type Props = {
      id: string;
      value: string;
      values: string[];
      constraints: InputConstraints<Record<string, InputConstraint>>;
      languageTag: string;
    };
    
    // STATE
    let {
      id,
      value = $bindable(),
      values,
      constraints,
      languageTag = 'core'
    }: Props = $props();

</script>
    
<select
    {id}
    name={id}
    class="select w-full rounded-md bg-neutral p-2 border-none focus:border-none focus-within:border-none outline-none focus:outline-none focus-within:outline-none"
    {...constraints}
    bind:value={value}>
    {#each values as optionValue}
      <option value={optionValue}>{optionValue}</option>
    {/each}
</select>