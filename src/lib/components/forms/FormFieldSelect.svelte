<script lang="ts">
    import Form from 'sveltekit-superforms';
    import Select from '$lib/components/forms/FormSelect.svelte';
        // TYPES
    import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
    import type { Component } from 'svelte';
    import type { ResourceType, FalsableRef, FalsableFacetType, CustomPropertyType } from '$lib/types';
    
    // TYPES
    type Props = {
      resourceType: ResourceType;
      entity: FalsableRef;
      facet: FalsableFacetType;
      languageTag: string;
      fieldId: string;
      field: {
        label: string;
        component: Component;
      };
      form: Form;
      constraints?: InputConstraints<Record<string, InputConstraint>>;
      errors?: ValidationErrors<Record<string, string>>;
      customPropertyType?: CustomPropertyType;
      customProperty?: string;
      customPropertyKey?: string;
      values: string[];
    };
    
    // STATE : PROPS
    let {
      resourceType,
      entity,
      facet,
      languageTag = 'core',
      fieldId,
      field,
      form,
      constraints,
      errors,
      customPropertyType,
      customProperty,
      customPropertyKey,
      values
    }: Props = $props();
    
    const isError = (languageTag: string, fieldId: string) =>
      (languageTag === 'core' && $errors[fieldId]) ||
      (languageTag === 'en' && $errors[fieldId]) ||
      $errors.translations?.[languageTag]?.[fieldId];
    
    const getError = (languageTag: string, fieldId: string) => {
      if (facet === 'config') {
        return $errors[fieldId][customPropertyType][customProperty][customPropertyKey];
      } else if (languageTag === 'core') {
        return $errors[fieldId];
      } else if (languageTag === 'en') {
        return $errors[fieldId];
      } else {
        return $errors.translations?.[languageTag]?.[fieldId];
      }
    };

</script>


<label class="form-control w-full">
    <div class="label text-sm">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if facet === 'config'}
          {$constraints[fieldId]?.[customPropertyType]?.[customProperty]?.[customPropertyKey]?.required ? '*' : ''}
        {:else}
          {$constraints[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    <div
    class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline  focus-within:outline-1 focus-within:outline-neutral-500">
    {#if facet == 'config'}
        <Select
          id={`${fieldId}_${customPropertyType}_${customProperty}_${customPropertyKey}`} 
          bind:value={$form[fieldId][customPropertyType][customProperty][customPropertyKey]}
          {values}
          />
      {:else if resourceType !== 'feature'}
        {#if languageTag === 'core' || languageTag === 'en'}
          <Select
            id={`${fieldId}_${languageTag}`}
            bind:value={$form[fieldId]}
            {values} />
        {:else}
          <Select
            bind:value={$form.translations[languageTag][fieldId]}
            id={`${fieldId}_${languageTag}`}
            {values} />
        {/if}
      {:else if languageTag === 'core' || languageTag === 'en'}
        <Select
          bind:value={$form.properties[fieldId]}
          id={`${fieldId}_${languageTag}`}
          {values} />
      {:else}
        <Select
          bind:value={$form.properties[`${fieldId}_${languageTag}`]}
          id={`${fieldId}_${languageTag}`}
          {values} />
      {/if}
    </div>
    {#if isError(languageTag, fieldId)}
      <div class="label">
        <span class="label-text-alt text-error"></span>
        <span class="label-text-alt text-error">{getError(languageTag, fieldId)}</span>
      </div>
    {/if}
  </label>
  