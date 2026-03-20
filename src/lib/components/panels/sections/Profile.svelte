<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { fade } from 'svelte/transition'
// AUTH
import { signOut } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { validateUsernameIssues } from '$lib/client/services/user'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import PencilSquare from 'virtual:icons/lucide/square-pen'
import Check from 'virtual:icons/lucide/check'
import ArrowPath from 'virtual:icons/lucide/refresh-cw'
import XMark from 'virtual:icons/lucide/x'
// ENUMS
import { Panel } from '$lib/enums'

// PROPS
type Props = {
  hideActions?: boolean
  hideEditableFields?: boolean
}

let { hideActions = false, hideEditableFields = false }: Props = $props()

const appCtx = getAppCtx()

// STATE
let isEditingUsername = $state(false)
let isLoadingUsername = $state(false)
let showSuccessIndicator = $state(false)
let showErrorIndicator = $state(false)
let editedUsername = $state('')

// TIMERS
let successTimer: ReturnType<typeof setTimeout>
let errorTimer: ReturnType<typeof setTimeout>

// VALIDATION
$effect(() => {
  if (editedUsername && validateUsernameIssues(editedUsername).issues.length > 0) {
    showErrorIndicator = true
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      showErrorIndicator = false
    }, 2500)
  } else {
    showErrorIndicator = false
    clearTimeout(errorTimer)
  }
})

// HANDLERS
const startEditingUsername = () => {
  const user = appCtx.getUser()
  if (user) {
    editedUsername = user.username || ''
    isEditingUsername = true
    // Focus the input after it renders
    setTimeout(() => {
      const input = document.querySelector('#username-input') as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      }
    }, 0)
  }
}

const saveUsername = async () => {
  const user = appCtx.getUser()
  if (!user || !editedUsername.trim()) return

  // Validate before saving
  if (validateUsernameIssues(editedUsername.trim()).issues.length > 0) {
    showErrorIndicator = true
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      showErrorIndicator = false
    }, 2500)
    return
  }

  isLoadingUsername = true

  // Use appCtx method which handles optimistic updates and debounced API calls
  await appCtx.setUsername(
    editedUsername.trim(),
    // onSuccess
    () => {
      showSuccessIndicator = true
      isEditingUsername = false
      isLoadingUsername = false

      clearTimeout(successTimer)
      successTimer = setTimeout(() => {
        showSuccessIndicator = false
      }, 2500)
    },
    // onInvalid
    () => {
      isLoadingUsername = false
      showErrorIndicator = true
      clearTimeout(errorTimer)
      errorTimer = setTimeout(() => {
        showErrorIndicator = false
      }, 2500)
    },
    // onError
    (error: any) => {
      console.error('Failed to save username:', error)
      isLoadingUsername = false
      showErrorIndicator = true
      clearTimeout(errorTimer)
      errorTimer = setTimeout(() => {
        showErrorIndicator = false
      }, 2500)
    },
  )
}

const cancelEdit = () => {
  isEditingUsername = false
  editedUsername = ''
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    saveUsername()
  } else if (event.key === 'Escape') {
    cancelEdit()
  }
}
</script>

<div class="relative flex w-full flex-col items-center overflow-hidden">
  <!-- Background SVG with Glow -->
  <div
    class="pointer-events-none absolute z-0 flex w-full -translate-y-27.5 items-center justify-center overflow-hidden px-1.5"
  >
    <svg
      width="362"
      height="340"
      viewBox="0 0 362 340"
      class="h-full w-full object-cover opacity-80"
    >
      <defs>
        <!-- Glow filter -->
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="coloredBlur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
        <!-- Stronger glow filter -->
        <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="coloredBlur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
      </defs>

      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M30.3348 123.012C29.5775 125.508 26.9403 126.917 24.4443 126.16C21.9483 125.403 20.5394 122.766 21.2966 120.27C44.2901 44.7023 117.448 -5.57389 197.237 0.970184C287.605 8.38186 356.085 85.7907 352.761 175.743C352.66 178.344 350.47 180.371 347.869 180.27C345.268 180.168 343.241 177.978 343.342 175.377C346.479 90.4787 281.828 17.3933 196.464 10.3921C121.074 4.20966 52.1362 51.5884 30.3348 123.012ZM20.6644 138.127C10.5548 137.298 1.68482 144.823 0.855647 154.933C-0.477336 171.185 18.5943 181.005 31.0462 170.441C43.4974 159.878 36.9168 139.46 20.6644 138.127ZM25.9607 150.667C20.8386 144.629 10.9257 147.811 10.2782 155.706C9.63066 163.601 18.8935 168.355 24.9301 163.233C28.6837 160.048 29.1453 154.42 25.9607 150.667ZM344.568 192.322C360.82 193.655 367.401 214.073 354.949 224.636C342.498 235.2 323.425 225.381 324.758 209.128C325.588 199.019 334.458 191.493 344.568 192.322ZM349.864 204.862C344.742 198.825 334.829 202.006 334.182 209.901C333.534 217.796 342.797 222.55 348.834 217.428C352.587 214.244 353.049 208.616 349.864 204.862ZM208.358 183.439C222.767 184.621 228.603 202.722 217.562 212.09C206.522 221.457 189.613 212.75 190.795 198.34C191.531 189.377 199.395 182.704 208.358 183.439ZM212.237 195.251C208.313 190.625 200.715 193.061 200.218 199.114C199.722 205.166 206.821 208.808 211.447 204.883C214.324 202.441 214.678 198.127 212.237 195.251ZM186.945 176.537C173.944 187.567 172.333 207.2 183.364 220.202L200.349 240.221C202.037 242.211 205.02 242.456 207.01 240.768L227.029 223.784C240.031 212.753 241.642 193.121 230.61 180.119C219.58 167.116 199.947 165.505 186.945 176.537ZM208.744 178.737C189.482 177.157 178.356 199.687 190.572 214.086L204.498 230.501L220.913 216.574C235.312 204.358 228.006 180.317 208.744 178.737ZM144.353 49.6909C144.219 67.0671 165.837 59.7328 175.95 65.5835C182.518 69.3838 184.222 76.3433 175.488 91.4379C171.642 98.0852 165.313 110.851 167.126 116.098C167.772 117.967 170.7 117.875 172.889 117.627C183.642 116.407 188.631 121.037 189.548 129.125C190.824 140.373 181.05 160.01 169.069 176.45C156.795 193.292 141.646 207.13 132.736 206.075C126.031 205.28 122.366 199.196 123.984 185.544C125.479 172.93 124.005 145.961 114.419 134.713C104.093 122.597 87.1652 142.654 62.2999 133.693C53.2214 164.164 55.9871 196.571 69.4246 224.534C85.5014 219.238 109.351 213.375 122.476 220.633C132.094 225.951 133.135 236.143 130.181 246.548C126.543 259.367 131.464 263.644 144.625 263.122C154.454 262.732 167.397 259.332 181.579 253.979C207.9 244.045 218.3 247.983 222.273 258.511C225.399 266.793 223.187 279.664 222.694 290.023C239.328 284.571 254.532 275.739 267.429 264.256C261.395 258.429 253.699 252.482 247.153 248.817C240.679 245.191 236.95 241.648 235.412 238.277C233.428 233.927 234.455 230.163 237.793 226.978C240.145 224.734 243.817 222.926 248.387 221.543C260.985 217.733 282.074 216.701 299.965 218.717C303.709 209.77 306.463 200.274 308.079 190.355C290.5 193.076 270.589 191.621 256.52 182.641C245.995 175.924 240.261 165.783 241.388 153.741C243.294 133.395 257.95 131.595 256.296 116.212C254.979 103.958 227.875 108.511 217.524 80.892C213.708 70.7087 212.538 58.6547 212.61 46.9532C189.799 41.5614 166.137 42.608 144.353 49.6909ZM65.3385 124.74C88.1795 132.86 105.547 109.77 121.59 128.595C133.108 142.11 135.181 171.127 133.343 186.645C132.512 193.656 132.825 196.596 133.838 196.716C139.151 197.345 150.923 185.336 161.446 170.896C172.263 156.054 181.161 138.973 180.163 130.17C179.898 127.836 178.045 126.546 173.935 127.013C161.336 128.442 155.467 120.878 157.991 108.63C159.271 102.418 162.653 94.7852 167.315 86.7288C172.412 77.9201 172.862 74.6954 171.24 73.7568C164.056 69.6 136.255 76.7562 134.877 53.1983C103.086 66.4398 77.7398 92.2786 65.3385 124.74ZM222.045 49.576C222.151 59.2029 223.226 69.2301 226.355 77.5783C235.581 102.196 263.416 94.1578 265.679 115.204C267.864 135.528 252.356 137.625 250.768 154.586C249.097 172.428 268.541 180.32 284.787 181.841C292.313 182.546 300.613 182.181 309.284 180.606C314.292 121.278 277.431 67.3193 222.045 49.576ZM213.168 292.733C158.038 306.094 101.62 281.047 73.8805 232.978C86.4532 228.942 108.207 223.529 117.907 228.893C123.276 231.862 122.765 238.089 121.09 243.988C118.18 254.238 118.952 264.432 128.471 269.588C142.084 276.959 167.767 269.275 184.893 262.812C204.419 255.443 211.486 256.645 213.441 261.827C215.072 266.146 214.497 273.302 213.879 281.001C213.571 284.844 213.253 288.809 213.168 292.733ZM295.746 227.768C290.043 238.831 282.769 248.904 274.241 257.719C267.573 251.257 259.095 244.71 251.754 240.599C247.154 238.022 244.717 235.973 243.994 234.388C243.934 234.255 244.054 234.057 244.31 233.813C245.55 232.63 247.92 231.544 251.091 230.585C261.896 227.318 279.761 226.317 295.746 227.768ZM194.484 34.5441C119.73 28.4131 54.1562 84.0463 48.0251 158.801C41.8939 233.557 97.5263 299.131 172.28 305.262C247.034 311.393 312.608 255.76 318.739 181.004C324.869 106.249 269.238 40.6752 194.484 34.5441ZM326.467 241.721C297.407 299.58 235.902 334.793 170.299 329.413C94.9196 323.231 34.5316 265.175 24.7349 191.231C24.3945 188.645 22.022 186.825 19.4361 187.165C16.8502 187.505 15.0303 189.878 15.37 192.464C25.7442 270.768 89.7363 332.292 169.526 338.836C238.941 344.529 304.223 307.201 334.903 245.934C336.067 243.604 335.121 240.772 332.791 239.61C330.462 238.446 327.63 239.392 326.467 241.721Z"
        fill="none"
        stroke="#F04D7F"
        stroke-width="2"
        filter="url(#strongGlow)"
        opacity="0.8"
      ></path>

      <!-- Additional inner glow layer -->
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M30.3348 123.012C29.5775 125.508 26.9403 126.917 24.4443 126.16C21.9483 125.403 20.5394 122.766 21.2966 120.27C44.2901 44.7023 117.448 -5.57389 197.237 0.970184C287.605 8.38186 356.085 85.7907 352.761 175.743C352.66 178.344 350.47 180.371 347.869 180.27C345.268 180.168 343.241 177.978 343.342 175.377C346.479 90.4787 281.828 17.3933 196.464 10.3921C121.074 4.20966 52.1362 51.5884 30.3348 123.012ZM20.6644 138.127C10.5548 137.298 1.68482 144.823 0.855647 154.933C-0.477336 171.185 18.5943 181.005 31.0462 170.441C43.4974 159.878 36.9168 139.46 20.6644 138.127ZM25.9607 150.667C20.8386 144.629 10.9257 147.811 10.2782 155.706C9.63066 163.601 18.8935 168.355 24.9301 163.233C28.6837 160.048 29.1453 154.42 25.9607 150.667ZM344.568 192.322C360.82 193.655 367.401 214.073 354.949 224.636C342.498 235.2 323.425 225.381 324.758 209.128C325.588 199.019 334.458 191.493 344.568 192.322ZM349.864 204.862C344.742 198.825 334.829 202.006 334.182 209.901C333.534 217.796 342.797 222.55 348.834 217.428C352.587 214.244 353.049 208.616 349.864 204.862ZM208.358 183.439C222.767 184.621 228.603 202.722 217.562 212.09C206.522 221.457 189.613 212.75 190.795 198.34C191.531 189.377 199.395 182.704 208.358 183.439ZM212.237 195.251C208.313 190.625 200.715 193.061 200.218 199.114C199.722 205.166 206.821 208.808 211.447 204.883C214.324 202.441 214.678 198.127 212.237 195.251ZM186.945 176.537C173.944 187.567 172.333 207.2 183.364 220.202L200.349 240.221C202.037 242.211 205.02 242.456 207.01 240.768L227.029 223.784C240.031 212.753 241.642 193.121 230.61 180.119C219.58 167.116 199.947 165.505 186.945 176.537ZM208.744 178.737C189.482 177.157 178.356 199.687 190.572 214.086L204.498 230.501L220.913 216.574C235.312 204.358 228.006 180.317 208.744 178.737ZM144.353 49.6909C144.219 67.0671 165.837 59.7328 175.95 65.5835C182.518 69.3838 184.222 76.3433 175.488 91.4379C171.642 98.0852 165.313 110.851 167.126 116.098C167.772 117.967 170.7 117.875 172.889 117.627C183.642 116.407 188.631 121.037 189.548 129.125C190.824 140.373 181.05 160.01 169.069 176.45C156.795 193.292 141.646 207.13 132.736 206.075C126.031 205.28 122.366 199.196 123.984 185.544C125.479 172.93 124.005 145.961 114.419 134.713C104.093 122.597 87.1652 142.654 62.2999 133.693C53.2214 164.164 55.9871 196.571 69.4246 224.534C85.5014 219.238 109.351 213.375 122.476 220.633C132.094 225.951 133.135 236.143 130.181 246.548C126.543 259.367 131.464 263.644 144.625 263.122C154.454 262.732 167.397 259.332 181.579 253.979C207.9 244.045 218.3 247.983 222.273 258.511C225.399 266.793 223.187 279.664 222.694 290.023C239.328 284.571 254.532 275.739 267.429 264.256C261.395 258.429 253.699 252.482 247.153 248.817C240.679 245.191 236.95 241.648 235.412 238.277C233.428 233.927 234.455 230.163 237.793 226.978C240.145 224.734 243.817 222.926 248.387 221.543C260.985 217.733 282.074 216.701 299.965 218.717C303.709 209.77 306.463 200.274 308.079 190.355C290.5 193.076 270.589 191.621 256.52 182.641C245.995 175.924 240.261 165.783 241.388 153.741C243.294 133.395 257.95 131.595 256.296 116.212C254.979 103.958 227.875 108.511 217.524 80.892C213.708 70.7087 212.538 58.6547 212.61 46.9532C189.799 41.5614 166.137 42.608 144.353 49.6909ZM65.3385 124.74C88.1795 132.86 105.547 109.77 121.59 128.595C133.108 142.11 135.181 171.127 133.343 186.645C132.512 193.656 132.825 196.596 133.838 196.716C139.151 197.345 150.923 185.336 161.446 170.896C172.263 156.054 181.161 138.973 180.163 130.17C179.898 127.836 178.045 126.546 173.935 127.013C161.336 128.442 155.467 120.878 157.991 108.63C159.271 102.418 162.653 94.7852 167.315 86.7288C172.412 77.9201 172.862 74.6954 171.24 73.7568C164.056 69.6 136.255 76.7562 134.877 53.1983C103.086 66.4398 77.7398 92.2786 65.3385 124.74ZM222.045 49.576C222.151 59.2029 223.226 69.2301 226.355 77.5783C235.581 102.196 263.416 94.1578 265.679 115.204C267.864 135.528 252.356 137.625 250.768 154.586C249.097 172.428 268.541 180.32 284.787 181.841C292.313 182.546 300.613 182.181 309.284 180.606C314.292 121.278 277.431 67.3193 222.045 49.576ZM213.168 292.733C158.038 306.094 101.62 281.047 73.8805 232.978C86.4532 228.942 108.207 223.529 117.907 228.893C123.276 231.862 122.765 238.089 121.09 243.988C118.18 254.238 118.952 264.432 128.471 269.588C142.084 276.959 167.767 269.275 184.893 262.812C204.419 255.443 211.486 256.645 213.441 261.827C215.072 266.146 214.497 273.302 213.879 281.001C213.571 284.844 213.253 288.809 213.168 292.733ZM295.746 227.768C290.043 238.831 282.769 248.904 274.241 257.719C267.573 251.257 259.095 244.710 251.754 240.599C247.154 238.022 244.717 235.973 243.994 234.388C243.934 234.255 244.054 234.057 244.31 233.813C245.55 232.63 247.92 231.544 251.091 230.585C261.896 227.318 279.761 226.317 295.746 227.768ZM194.484 34.5441C119.73 28.4131 54.1562 84.0463 48.0251 158.801C41.8939 233.557 97.5263 299.131 172.28 305.262C247.034 311.393 312.608 255.76 318.739 181.004C324.869 106.249 269.238 40.6752 194.484 34.5441ZM326.467 241.721C297.407 299.58 235.902 334.793 170.299 329.413C94.9196 323.231 34.5316 265.175 24.7349 191.231C24.3945 188.645 22.022 186.825 19.4361 187.165C16.8502 187.505 15.0303 189.878 15.37 192.464C25.7442 270.768 89.7363 332.292 169.526 338.836C238.941 344.529 304.223 307.201 334.903 245.934C336.067 243.604 335.121 240.772 332.791 239.61C330.462 238.446 327.63 239.392 326.467 241.721Z"
        fill="none"
        stroke="#F04D7F"
        stroke-width="1"
        filter="url(#glow)"
        opacity="0.6"
      ></path>
    </svg>
  </div>

  <!-- Profile Content -->
  <div class="flex flex-col items-center gap-3 py-4">
    <!-- Avatar -->
    <div class="avatar">
      <div class="w-32 rounded-full ring ring-black/40">
        <img alt="Avatar" src={appCtx.getUser()?.image} referrerpolicy="no-referrer">
      </div>
    </div>

    <!-- Username -->
    <div class="z-20 -mt-6 rounded-full bg-black/80 px-4 py-1">
      <div class="flex items-center gap-2">
        {#if hideEditableFields}
          <!-- Display Mode: Username (non-editable) -->
          <span
            class="tooltip font-medium text-white"
            data-tip={appCtx.getUser()?.attribution || 'No attribution set'}
          >
            {#if appCtx.getUser()}
              {@const user = appCtx.getUser()!}
              {user.username ?? ('name' in user ? user.name : null) ?? m.anonymous()}
            {/if}
          </span>
        {:else}
          {#if isEditingUsername}
            <!-- Edit Mode: Input Field -->
            <input
              id="username-input"
              type="text"
              class="min-w-0 border-none bg-transparent font-medium text-white outline-none placeholder:text-white/60 focus:outline-none"
              bind:value={editedUsername}
              onkeydown={handleKeydown}
              placeholder={m.warm_that_duck_slide()}
            >
          {:else}
            <!-- Display Mode: Username -->
            <span class="font-medium text-white">
              {#if appCtx.getUser()}
                {@const user = appCtx.getUser()!}
                {user.username ?? ('name' in user ? user.name : null) ?? m.anonymous()}
              {/if}
            </span>
          {/if}

          <!-- Edit Icon -->
          <button
            class="flex h-4 w-4 items-center justify-center text-white/80 transition-colors hover:text-white"
            onclick={isEditingUsername ? saveUsername : startEditingUsername}
          >
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
        {/if}
      </div>
    </div>

    <!-- Sign Out Button -->
    {#if !hideActions}
      <div class="z-10 flex flex-row items-center gap-2">
        <button
          class="btn btn-sm uppercase"
          onclick={() => {
            // Open profile panel with current user's username
            const user = appCtx.getUser();
            appCtx.setPanelCtx(Panel.profile, 'username', user?.username);
            appCtx.togglePanel(Panel.profile);
          }}
        >
          {m.whole_livid_alligator_commend()}
        </button>
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
            })}
        >
          {m.profile__logout()}
        </button>
      </div>
    {/if}
  </div>
</div>
