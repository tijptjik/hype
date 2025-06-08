<script lang="ts">
// @ts-nocheck - Debugging purposes
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { ProjectRole, UserFieldProps, OrganisationForm, OrganisationRole, ProjectForm } from '$lib/types';

// STATE : PROPS
let {
  fieldRoot,
  joinConfig,
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  ...fieldProps
}: UserFieldProps = $props();

// Destructure joinConfig
const { discriminator: userJoinStateKey, checkedValue, uncheckedValue } = joinConfig;

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// STATE : CONTEXT :: FORM
let userForm: (OrganisationForm | ProjectForm)['form'] = $derived((fieldProps.form as OrganisationForm | ProjectForm).form);

const updateUserJoinState = (userId: string, isChecked: boolean) => {
  // @ts-ignore - Debugging purposes  
  userForm.update(($form) => {
    const userRoles = [...($form[fieldRoot] || [])];
    const userIndex = userRoles.findIndex(
      (userRole: any) => userRole.userId === userId
    );
    if (userIndex !== -1) {
      userRoles[userIndex] = {
        ...userRoles[userIndex],
        [userJoinStateKey]: isChecked ? checkedValue : uncheckedValue
      };
    }
    return { ...$form, [fieldRoot]: userRoles };
  });
};

const removeUser = async (e: Event, userId: string) => {
  e.preventDefault();
  // @ts-ignore - Debugging purposes
  userForm.update(($form) => {
    const userRoles = [...($form[fieldRoot] || [])];
    const updatedUsers = userRoles.filter(
      (userRole: any) => userRole.userId !== userId
    );
    return { ...$form, [fieldRoot]: updatedUsers };
  });
  
  try {
    await (fieldProps.form as OrganisationForm | ProjectForm).validate(fieldRoot as any);
  } catch (error) {
    console.warn('Validation error:', error);
  }
};

// Access form value directly
let userRoles = $derived(($userForm as any)[fieldRoot] || [] as OrganisationRole[] | ProjectRole[]);

// Update modes based on user roles length
$effect(() => {
  if (userRoles.length === 0 && removeMode) {
    removeMode = false;
    searchMode = true;
  }
});
</script>

<div class="grid grid-cols-1 gap-4 p-4 2xl:grid-cols-2">
  {#each userRoles.sort((a: OrganisationRole | ProjectRole, b: OrganisationRole | ProjectRole) => a.user.name?.localeCompare(b.user.name ?? '') ?? 0) as userRole, index (userRole.user.id)}
  <div class="grid-span-1 group" in:scale out:scale animate:flip={{ duration: 200 }}>
      <div
        class="card card-side relative h-full flex-row items-center overflow-hidden rounded-l-xl bg-base-100 pr-6 shadow-xl">
        {#if removeMode}
          <div
            class="absolute left-0 top-0 flex w-24 items-center justify-center opacity-80">
            <button
              onclick={(e) => removeUser(e, userRole.user.id)}
              class="btn btn-ghost h-24 w-24 rounded-none bg-base-200">
              <Icon src={Trash} class="h-6 w-6" />
            </button>
          </div>
        {/if}
        <figure class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-l-xl md:block">
          <img src={userRole.user.image} alt={userRole.user.name} />
        </figure>
        <div class="card-body flex-auto py-0">
          <p
            class="card-title flex flex-col items-start justify-start gap-1 text-lg font-normal">
            <span class="text-xs text-gray-500">
              {userRole.user.attribution}
            </span>
            <span>{userRole.user.name}</span>
          </p>
        </div>
        <label
          class="label flex flex-shrink-0 flex-grow-0 flex-col items-center gap-2 pb-2 text-sm"
          style="font-variant: small-caps; font-variant-caps: small-caps;">
          {resourceState.activeResource === 'project' ? 'Maintainer' : 'Owner'}
          <input
            name={userRole.user.id}
            type="checkbox"
            data-testid={`userCheckbox_${index}`}
            class="checkbox-primary checkbox checkbox-lg"
            checked={(userRole as any)[userJoinStateKey] === checkedValue}
            onchange={(e) =>
              updateUserJoinState(userRole.user.id, e.currentTarget.checked)} />
        </label>
      </div>
    </div>
  {/each}
</div>
