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

<div class="container mx-auto mb-12 mt-24 flex h-fit justify-center">
  <div class="max-w-128 card min-h-64 bg-white text-black shadow-xl">
    <div class="card-body flex flex-col">
      <h1 class="card-title">{user.name}</h1>
      <div class="space-y-2">
        <p><b>{m.profile__registered_account()}</b> {user.email}</p>
        <p><b>{m.profile__member_since()}</b> {formatDate(user.createdAt)}</p>
      </div>
      <div class="mt-4">
        <h2 class="font-bold">{m.profile__attribution()}</h2>
        <small class="text-gray-500">{m.profile__attribution_note()}</small>
        <p>{user.attribution}</p>
      </div>
      {#if user.roles && user.roles.length > 0}
        <div class="mt-4 flex-grow">
          <h2 class="font-bold">{m.profile__memberships()}</h2>
          <small class="text-gray-500">{m.profile__memberships_note()}</small>

          <h3 class="mb-2 mt-3 font-semibold">{m.profile__organisations()}</h3>
          <ul class="mt-2 space-y-2">
            {#each user.roles.filter((role) => role.type === 'organisations') as role}
              <li>
                <div class="flex flex-wrap items-center">
                  <span class="badge badge-outline mb-1 mr-2"
                    >{m[`profile__role_type__${role.role}`]()}</span>
                  <a href="/admin/{role.type}/{role.resourceRef}" class="break-all hover:underline"
                    >{role.resourceName}</a>
                </div>
              </li>
            {/each}
          </ul>

          <h3 class="mb-2 mt-4 font-semibold">{m.profile__projects()}</h3>
          <ul class="mt-2 space-y-2">
            {#each user.roles.filter((role) => role.type === 'projects') as role}
              <li>
                <div class="flex flex-wrap items-center">
                  <span class="badge badge-outline mb-1 mr-2"
                    >{m[`profile__role_type__${role.role}`]()}</span>
                  <a href="/admin/organisations/{role.parentRef}" class="break-all hover:underline"
                    >{role.parentName}</a>
                  <span class="mx-1">/</span>
                  <a href="/admin/{role.type}/{role.resourceRef}" class="break-all hover:underline"
                    >{role.resourceName}</a>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <div class="card-actions mt-4 justify-end">
        <button class="btn btn-secondary" onclick={() => signOut()}>{m.profile__logout()}</button>
      </div>
    </div>
  </div>
</div>
