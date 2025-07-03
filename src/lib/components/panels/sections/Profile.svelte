<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
import { fade } from 'svelte/transition';
// AUTH
import { signOut } from '$lib/auth/client';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { PencilSquare, Check, ArrowPath, XMark } from '@steeze-ui/heroicons';
// UTILS
import { validateDisplayUsername } from '$lib/utils/username';

const appCtx = getAppCtx();

// STATE
let isEditingUsername = $state(false);
let isLoadingUsername = $state(false);
let showSuccessIndicator = $state(false);
let showErrorIndicator = $state(false);
let editedUsername = $state('');

// TIMERS
let successTimer: ReturnType<typeof setTimeout>;
let errorTimer: ReturnType<typeof setTimeout>;

// VALIDATION
$effect(() => {
  if (editedUsername && !validateDisplayUsername(editedUsername)) {
    showErrorIndicator = true;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      showErrorIndicator = false;
    }, 2500);
  } else {
    showErrorIndicator = false;
    clearTimeout(errorTimer);
  }
});

// HANDLERS
const startEditingUsername = () => {
  const user = appCtx.getUser();
  if (user) {
    editedUsername = user.displayUsername || user.username || '';
    isEditingUsername = true;
    // Focus the input after it renders
    setTimeout(() => {
      const input = document.querySelector('#username-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }
};

const saveUsername = async () => {
  const user = appCtx.getUser();
  if (!user || !editedUsername.trim()) return;

  // Validate before saving
  if (!validateDisplayUsername(editedUsername.trim())) {
    showErrorIndicator = true;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      showErrorIndicator = false;
    }, 2500);
    return;
  }

  isLoadingUsername = true;

  // Use appCtx method which handles optimistic updates and debounced API calls
  await appCtx.setUserDisplayUsername(
    editedUsername.trim(),
    // onSuccess
    () => {
      showSuccessIndicator = true;
      isEditingUsername = false;
      isLoadingUsername = false;

      clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        showSuccessIndicator = false;
      }, 2500);
    },
    // onError
    (error: any) => {
      console.error('Failed to save username:', error);
      isLoadingUsername = false;
      showErrorIndicator = true;
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        showErrorIndicator = false;
      }, 2500);
    }
  );
};

const cancelEdit = () => {
  isEditingUsername = false;
  editedUsername = '';
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    saveUsername();
  } else if (event.key === 'Escape') {
    cancelEdit();
  }
};
</script>

<div
  class="relative flex w-full flex-col items-center bg-[url(/profileGlobe.svg)] bg-cover bg-center">
  <!-- Profile Content -->
  <div class="flex flex-col items-center gap-3 py-4">
    <!-- Avatar -->
    <div class="avatar">
      <div class="w-32 rounded-full ring ring-black/40">
        <img alt="Avatar" src={appCtx.getUser()?.image} referrerpolicy="no-referrer" />
      </div>
    </div>

    <!-- Username -->
    <div class="z-20 -mt-6 rounded-full bg-black/80 px-4 py-1">
      <div class="flex items-center gap-2">
        {#if isEditingUsername}
          <!-- Edit Mode: Input Field -->
          <input
            id="username-input"
            type="text"
            class="min-w-0 border-none bg-transparent font-medium text-white outline-none placeholder:text-white/60 focus:outline-none"
            bind:value={editedUsername}
            onkeydown={handleKeydown}
            placeholder={m.acidic_lost_shark_pop()} />
        {:else}
          <!-- Display Mode: Username -->
          <span class="font-medium text-white">
            {#if appCtx.getUser()}
              {@const user = appCtx.getUser()!}
              {user.displayUsername ??
                user.username ??
                user.name ??
                m.tidy_level_hawk_belong()}
            {/if}
          </span>
        {/if}

        <!-- Edit Icon -->
        <button
          class="flex h-4 w-4 items-center justify-center text-white/80 transition-colors hover:text-white"
          onclick={isEditingUsername ? saveUsername : startEditingUsername}>
          {#if isLoadingUsername}
            <Icon src={ArrowPath} class="h-4 w-4 animate-spin" />
          {:else if showErrorIndicator}
            <div transition:fade={{ duration: 300 }}>
              <Icon src={XMark} class="h-4 w-4 text-red-400" />
            </div>
          {:else if showSuccessIndicator}
            <div transition:fade={{ duration: 300 }}>
              <Icon src={Check} class="h-4 w-4 text-green-400" />
            </div>
          {:else if isEditingUsername}
            <Icon src={Check} class="h-4 w-4" />
          {:else}
            <Icon src={PencilSquare} class="h-4 w-4" />
          {/if}
        </button>
      </div>
    </div>

    <!-- Sign Out Button -->
    <div class="flex flex-row items-center gap-2">
      <a class="btn btn-sm uppercase" href={`/users/${appCtx.getUser()?.username}`}>
        {m.whole_livid_alligator_commend()}
      </a>
      <button
        class="btn btn-sm uppercase"
        onclick={async () =>
          await signOut({
            fetchOptions: {
              onSuccess: () => {
                goto('/'); // redirect to login page
              },
              onError: (error) => {
                console.error('Sign out failed:', error);
              }
            }
          })}>
        {m.navbar__signout()}
      </button>
    </div>
  </div>
</div>
