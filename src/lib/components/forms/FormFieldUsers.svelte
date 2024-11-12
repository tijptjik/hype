<script lang="ts">
import Form from 'sveltekit-superforms';
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import { Icon } from '@steeze-ui/svelte-icon';
import { Trash } from '@steeze-ui/heroicons';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { ResourceType, FalsableRef } from '$lib/types';

type Props = {
  fieldId: string;
  form: Form;
  constraints: InputConstraints<Record<string, InputConstraint>>;
  errors: ValidationErrors<Record<string, string>>;
  userJoinStateKey: string;
  checkedValue: string;
  uncheckedValue: string;
  actionProps: {
    searchMode: boolean;
    removeMode: boolean;
  };
  entity: FalsableRef;  
  resourceType: Exclude<ResourceType, 'layer' | 'feature'>;
};


// STATE : PROPS
let {
  fieldId,
  userJoinStateKey,
  checkedValue,
  uncheckedValue,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false
  }),
  entity,
  resourceType
}: Props = $props();

// CONTEXT
const { form, validate} = getForm(resourceType, entity);

const updateUserJoinState = (userId: string, isChecked: boolean) => {
  form.update(($form) => {
    const userIndex = $form[fieldId].findIndex((userRole) => userRole.userId === userId);
    if (userIndex !== -1) {
      $form[fieldId][userIndex][userJoinStateKey] = isChecked ? checkedValue : uncheckedValue;
    }
    return $form;
  });
};

const removeUser = async (e: Event, userId: string) => {
  e.preventDefault();
  form.update(($form) => {
    const updatedUsers = $form[fieldId].filter((userRole) => userRole.userId !== userId);
    return { ...$form, [fieldId]: updatedUsers };
  });
  const result = await validate('userRoles');
  if ($form[fieldId].length === 0) {
    actionProps.removeMode = false;
    actionProps.searchMode = true;
  }
};
</script>

<!-- TODO Consider which users to show for projects, and what the non-maintainer role really means -->

<div class="grid grid-cols-1 gap-4 p-4 2xl:grid-cols-2">
  {#each $form[fieldId].sort((a, b) => a.user.name.localeCompare(b.user.name)) as userRole, index (userRole.user.id)}
    <div class="grid-span-1 group" in:scale out:scale animate:flip={{ duration: 200 }}>
      <div class="card card-side h-full flex-row items-center bg-base-100 pr-6 shadow-xl relative rounded-l-xl overflow-hidden">
        {#if actionProps.removeMode}
          <div class="absolute left-0 top-0 flex w-24 items-center justify-center opacity-80">
            <button
              onclick={(e) => removeUser(e, userRole.user.id)}
              class="btn btn-ghost w-24 h-24 bg-base-200 rounded-none">
              <Icon src={Trash} class="h-6 w-6" />
            </button>
          </div>
        {/if}
        <figure class="flex-shrink-0 flex-grow-0 md:block rounded-l-xl overflow-hidden">
          <img src={userRole.user.image} alt={userRole.user.name} />
        </figure>
        <div class="card-body flex-auto truncate">
          <p class="card-title overflow-hidden truncate text-ellipsis text-lg font-normal">
            {userRole.user.name}
          </p>
        </div>
        <label
          class="label flex flex-shrink-0 flex-grow-0 flex-col items-center gap-2 pb-2 text-sm"
          style="font-variant: small-caps; font-variant-caps: small-caps;">
          {resourceType === 'project' ? 'Maintainer' : 'Owner'}
          <input
            type="checkbox"
            name={userRole.user.id}
            class="checkbox-primary checkbox checkbox-lg"
            checked={userRole[userJoinStateKey] === checkedValue}
            onchange={(e) => updateUserJoinState(userRole.user.id, e.currentTarget.checked)} />
        </label>
      </div>
    </div>
  {/each}
</div>
