<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { ProjectRole, Resource, SectionProps, ActionProps } from '$lib/types';

// STATE : PROPS
let {
  fieldRoot,
  userJoinStateKey,
  checkedValue,
  uncheckedValue,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false
  }),
  ...fieldProps
}: SectionProps &
  ActionProps & {
    fieldRoot: keyof Resource;
    userJoinStateKey: string;
    uncheckedValue: string;
    checkedValue: string;
  } = $props();

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// CONTEXT
const { form, validate } = fieldProps.form;

const updateUserJoinState = (userId: string, isChecked: boolean) => {
  form.update(($form) => {
    const userIndex = $form[fieldRoot].findIndex(
      (userRole: ProjectRole) => userRole.userId === userId
    );
    if (userIndex !== -1) {
      $form[fieldRoot][userIndex][userJoinStateKey] = isChecked
        ? checkedValue
        : uncheckedValue;
    }
    return $form;
  });
};

const removeUser = async (e: Event, userId: string) => {
  e.preventDefault();
  form.update(($form) => {
    const updatedUsers = $form[fieldRoot].filter(
      (userRole: ProjectRole) => userRole.userId !== userId
    );
    return { ...$form, [fieldRoot]: updatedUsers };
  });
  // @ts-ignore
  const result = await validate('userRoles');
  if ($form[fieldRoot].length === 0) {
    actionProps.removeMode = false;
    actionProps.searchMode = true;
  }
};
</script>

<div class="grid grid-cols-1 gap-4 p-4 2xl:grid-cols-2">
  {#each $form[fieldRoot].sort((a: ProjectRole, b: ProjectRole) => a.user.name?.localeCompare(b.user.name ?? '') ?? 0) as userRole, index (userRole.user.id)}
    <div class="grid-span-1 group" in:scale out:scale animate:flip={{ duration: 200 }}>
      <div
        class="card card-side relative h-full flex-row items-center overflow-hidden rounded-l-xl bg-base-100 pr-6 shadow-xl">
        {#if actionProps.removeMode}
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
            checked={userRole[userJoinStateKey] === checkedValue}
            onchange={(e) =>
              updateUserJoinState(userRole.user.id, e.currentTarget.checked)} />
        </label>
      </div>
    </div>
  {/each}
</div>
