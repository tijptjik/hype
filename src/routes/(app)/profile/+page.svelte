<script lang="ts">
import { format } from 'date-fns';
import * as m from '$lib/paraglide/messages.js';
import { signOut } from '@auth/sveltekit/client';

const { data } = $props();
const { user } = data;

function formatDate(dateString: string): string {
  return format(new Date(dateString), 'd MMMM yyyy');
}
</script>

<div class="container mx-auto mb-12 mt-24 flex justify-center">
  <div class="card min-h-64 h-auto max-h-96 max-w-96 bg-white text-black shadow-xl">
    <div class="card-body">
      <h2 class="card-title">{user.name}</h2>
      <div class="space-y-2">
        <p><b>{m.profile__registered_account()}</b> {user.email}</p>
        <p><b>{m.profile__member_since()}</b> {formatDate(user.createdAt)}</p>
      </div>
      <div class="mt-4">
        <h3 class="font-bold">{m.profile__credit()}</h3>
        <p>{user.attribution}</p>
      </div>
      {#if user.roles && user.roles.length > 0}
        <div class="mt-4">
          <h3 class="font-bold">{m.profile__memberships()}</h3>
          <ul class="mt-2 space-y-2">
            {#each user.roles as role}
              <li>
                <div class="flex items-center">
                  <span
                    class="badge badge-{role.type === 'organisations' ? 'primary' : 'secondary'} mr-2"
                  >
                    {m[`profile__role_resource_type__${role.type}`]()}
                  </span>
                  <span class="badge badge-outline mr-2">{m[`profile__role_type__${role.role}`]()}</span>
                  {#if role.parentId}
                    <a href="/admin/{role.type === 'projects' ? 'organisations' : role.type}/{role.parentRef}" class="hover:underline">{role.parentName}</a>
                    <span class="mx-1">/</span>
                  {/if}
                  <a href="/admin/{role.type}/{role.resourceRef}" class="hover:underline">{role.resourceName}</a>
                </div>
              </li>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <div class="card-actions justify-end mt-4">
        <button class="btn btn-secondary" onclick={() => signOut()}>{m.profile__logout()}</button>
      </div>
    </div>
  </div>
</div>
