<script lang="ts">
import Form from 'sveltekit-superforms';
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
// TYPES
import type { User } from '$lib/types/user';

type Props = {
  fieldId: string;
  field: Record<string, string>;
  form: Form;
  constraints: InputConstraints<Record<string, InputConstraint>>;
  errors: ValidationErrors<Record<string, string>>;
};

// STATE : PROPS
let { fieldId, field, form, constraints, errors }: Props = $props();

function updateUserRole(userId: string, isOwner: boolean) {
  form.update($form => {
    $form[fieldId][userId].role = isOwner ? 'owner' : 'member';
    return $form;
  });
}
</script>

{#each Object.entries($form[fieldId]) as [userId, { user }]}
  <div class="card card-side flex-row items-center bg-base-100 pr-6 shadow-xl">
    <figure class="flex-grow-0 flex-shrink-0 hidden md:block">
      <img src={user.image} alt={user.name} />
    </figure>
    <div class="card-body flex-grow-1 flex-shrink-1 truncate">
      <h2 class="card-title truncate text-ellipsis overflow-hidden">{user.name}</h2>
    </div>
    <label
      class="label flex flex-col flex-grow-0 flex-shrink-0 items-center gap-2 pb-2 text-sm"
      style="font-variant: small-caps; font-variant-caps: small-caps;">
      Owner
      <input
        type="checkbox"
        name={userId}
        class="checkbox-primary checkbox checkbox-lg"
        checked={$form[fieldId][userId].role === 'owner'}
        on:change={(e) => updateUserRole(userId, e.currentTarget.checked)} />
    </label>
  </div>
{/each}
