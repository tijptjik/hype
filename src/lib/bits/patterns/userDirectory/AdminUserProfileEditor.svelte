<script lang="ts">
// SVELTE
import { untrack, onDestroy } from 'svelte'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { goto } from '$app/navigation'
// NAVIGATION
import { createUserFacetNavigation } from '#lib/users/userFacetNavigation.svelte.js'
// API
import {
  adminProfileErrorMessage,
  adminProfileErrorField,
} from '#lib/users/adminProfileError.js'
import { discardImageUpload, cleanupImageUploads } from '#lib/api/image.remote.js'
import { saveAdminUserProfile } from '#lib/api/adminUser.remote.js'
// BITS COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import UserProfileVisual from './UserProfileVisual.svelte'
import AdminUserProfileView from './AdminUserProfile.svelte'
import UserContributionsDashboard from './UserContributionsDashboard.svelte'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import PaletteIcon from 'virtual:icons/tabler/palette'
import SlidersIcon from 'virtual:icons/lucide/sliders-horizontal'
import PersonIcon from 'virtual:icons/proicons/person'
import PhoneIcon from 'virtual:icons/proicons/phone'
import GlobeIcon from 'virtual:icons/proicons/globe'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import InfoIcon from 'virtual:icons/lucide/info'
import UserLinkedAccounts from './UserLinkedAccounts.svelte'
import UserAccess from './UserAccess.svelte'
import UserChangelog from './UserChangelog.svelte'
import HistoryIcon from 'virtual:icons/proicons/history'
import ShieldIcon from 'virtual:icons/lucide/shield-check'
import SettingsIcon from 'virtual:icons/proicons/settings'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
import AdminUserMessagingFields from './AdminUserMessagingFields.svelte'
import { validateAdminPhoneFields } from '#lib/users/adminPhoneValidation.js'
import {
  createAdminMessagingDraft,
  type AdminProfileSaveResult,
} from '#lib/users/adminMessagingDraft.js'
// APPEARANCE
import { THEMES } from '#lib/themes/themes.js'
import { MAP_STYLE_KEYS } from '#lib/map/styles/registry.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
import { getMapStyleCatalogCopy } from '#lib/map/styles/i18n.js'
// TYPES
import type { AdminUserProfile } from '#lib/db/zod/schema/user.types.js'

let {
  data,
  superAdmin,
  onsaved,
  model,
}: {
  model: UserContributionsModel
  data: AdminUserProfile
  superAdmin: boolean
  onsaved: (result: AdminProfileSaveResult) => void
} = $props()
const headerCtrl = getHeaderCtrl()
const editing = $derived(headerCtrl.state.isEditing)
const facetNavigation = createUserFacetNavigation(() => facets)
const activeFacet = $derived(facetNavigation.active)
const localeOptions = [
  { tag: 'en', autonym: 'English', name: 'English' },
  { tag: 'zh-hant', autonym: '繁體中文', name: 'Traditional Chinese' },
  { tag: 'zh-hans', autonym: '简体中文', name: 'Simplified Chinese' },
]
let baseline = $state('')
let saving = $state(false)
let disposed = false
let uploadingAvatar = $state(false)
const disabled = $derived(!editing || saving)
let messagingDraft = $state(createAdminMessagingDraft())
let message = $state('')
let fieldErrors = $state<Record<string, string>>({})
let selectionEpoch = $state(0)
let avatarSelection = $state<{ imageId: string; url: string } | null>(null)
let draft = $state<NonNullable<AdminUserProfile['settings']> | null>(null)
const validationErrors = $derived(
  validateAdminPhoneFields(
    draft?.telephone ?? null,
    messagingDraft,
    createAdminMessagingDraft(data.messagingSettings),
  ),
)
const visibleFieldErrors = $derived({ ...fieldErrors, ...validationErrors })
const hasFieldErrors = $derived(Object.keys(visibleFieldErrors).length > 0)
let preferences = $state<Record<string, unknown>>({})
let experimental = $state<Record<string, unknown>>({})
let theme = $state({
  uiTheme: '',
  mapStyle: '',
  syncUiAndMap: true,
  useActiveMapStyle: true,
})
let contributionPrefs = $state({ observePrisms: false, showAll: false })
let adminPrefs = $state({
  isAdminMapCollapsed: false,
  isPrimaryPanelCollapsed: false,
  isPrimaryPanelAutoHide: false,
})
const fieldId = $props.id()
const languageOptions = [
  ['allowMachineTranslation', 'Allow machine translation'],
  ['preferFallbackInCurrentLocale', 'Prefer fallback in current language'],
  ['isTranslateButtonVisible', 'Show translate button'],
] as const

/** Discard the pending selection on replacement, reset or departure.
 * @returns Nothing; cleanup failures remain retryable through receipt expiry.
 */
function discardAvatar(): void {
  const previous = avatarSelection
  avatarSelection = null
  if (previous)
    void discardImageUpload({ imageId: previous.imageId }).catch(cause => {
      console.error('Pending image cleanup will be retried:', cause)
    })
}

function begin(): void {
  if (!data.settings) return
  selectionEpoch += 1
  discardAvatar()
  draft = { ...data.settings }
  messagingDraft = createAdminMessagingDraft(data.messagingSettings)
  preferences = JSON.parse(draft.preferences)
  experimental = JSON.parse(draft.experimental)
  theme = {
    uiTheme: '',
    mapStyle: '',
    syncUiAndMap: true,
    useActiveMapStyle: true,
    ...((preferences.theme as object) ?? {}),
  }
  contributionPrefs = {
    observePrisms: false,
    showAll: false,
    ...((preferences.profileContributions as object) ?? {}),
  }
  adminPrefs = {
    isAdminMapCollapsed: false,
    isPrimaryPanelCollapsed: false,
    isPrimaryPanelAutoHide: false,
    ...((preferences.admin as object) ?? {}),
  }
  message = ''
  fieldErrors = {}
  baseline = serializeDraft()
}

async function save(): Promise<void> {
  if (
    !editing ||
    uploadingAvatar ||
    saving ||
    !data.canEdit ||
    !draft ||
    !data.updatedAt
  )
    return
  if (hasFieldErrors) {
    selectFacet('profile')
    return
  }
  const targetId = data.profile.id
  const previousUsername = data.profile.username
  saving = true
  message = ''
  fieldErrors = {}
  try {
    const result = await saveAdminUserProfile({
      id: data.profile.id,
      updatedAt: data.updatedAt,
      imageId: avatarSelection?.imageId,
      messaging: messagingDraft,
      settings: {
        ...draft,
        preferences: JSON.stringify({
          ...preferences,
          theme: theme.uiTheme ? { ...theme, mapStyle: theme.mapStyle || null } : null,
          profileContributions: contributionPrefs,
          admin: adminPrefs,
        }),
        experimental: JSON.stringify(experimental),
      },
    })
    if (disposed || data.profile.id !== targetId) return
    avatarSelection = null
    void cleanupImageUploads({}).catch(cause =>
      console.error('Image cleanup will be retried:', cause),
    )
    onsaved(result)
    headerCtrl.setEditing(false)
    if (result.username !== previousUsername)
      await goto(`/admin/users/${encodeURIComponent(result.username)}`)
  } catch (cause) {
    if (disposed || data.profile.id !== targetId) return
    const field = adminProfileErrorField(cause)
    if (field) {
      fieldErrors[field] = adminProfileErrorMessage(cause)
      selectFacet('profile')
    } else message = adminProfileErrorMessage(cause)
  } finally {
    saving = false
  }
}

// Keep the resource toolbar and all facets on one shared draft, including Reset/Save.
function serializeDraft(): string {
  return JSON.stringify({
    draft,
    avatarSelection,
    messagingDraft,
    preferences,
    experimental,
    theme,
    contributionPrefs,
    adminPrefs,
  })
}
const dirty = $derived(Boolean(baseline) && serializeDraft() !== baseline)
const facets = $derived(
  new Map([
    ['profile', { label: 'Profile', icon: PersonIcon }],
    ['contributions', { label: 'Contributions', icon: PersonIcon }],
    ['access', { label: 'Access', icon: ShieldIcon }],
    ...(data.canViewChangelog
      ? ([['changelog', { label: 'Change log', icon: HistoryIcon }]] as const)
      : []),
    ...(data.canEdit
      ? ([['advanced', { label: 'Advanced', icon: SettingsIcon }]] as const)
      : []),
  ]),
)

/**
 * Selects a user tab through the URL so links, reloads and browser history agree.
 * @param facet Requested visible tab.
 * @returns Nothing; SvelteKit publishes the selected tab after navigation.
 * @remarks Shallow navigation preserves the shared unsaved profile draft.
 */
function selectFacet(facet: string): void {
  facetNavigation.select(facet)
}

$effect(() => {
  const current = data
  untrack(() => {
    headerCtrl.setEditing(false)
    headerCtrl.setHeaderForEntity(
      current.profile.displayUsername ?? current.profile.username ?? 'User',
      PersonIcon,
      new Map(),
    )
    headerCtrl.setSearch(null)
    begin()
  })
})
$effect(() => {
  headerCtrl.setFacets(facets, { active: activeFacet, onFacetChange: selectFacet })
  headerCtrl.setFormActions({
    canEdit: data.canEdit,
    dirty,
    hasIssues: hasFieldErrors,
    isSubmitting: saving,
    disableEdit: saving || uploadingAvatar,
    showPublishAction: false,
    showDeleteAction: false,
    canPublish: false,
    reset: begin,
    submit: () => {
      void save()
    },
  })
})
onDestroy(() => {
  discardAvatar()
  disposed = true
  headerCtrl.setEditing(false)
  headerCtrl.clearFormActions()
})
</script>

{#snippet toggle(
  label: string,
  checked: boolean,
  change: (value: boolean) => void,
  locked = false,
)}
  <div class="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2">
    <label
      for={`${fieldId}-${label.replaceAll(' ', '-')}`}
      class="min-w-0 text-sm font-medium break-words whitespace-normal"
      >{label}</label
    >
    <Switch
      id={`${fieldId}-${label.replaceAll(' ', '-')}`}
      {checked}
      disabled={disabled || locked}
      onCheckedChange={value => change(value === true)}
    />
  </div>
{/snippet}

{#snippet themePreview(value: string)}
  {#if THEMES.some(option => option.id === value)}
    <!-- Use the app theme picker's live palette tokens, including each theme's surfaces. -->
    <span
      data-theme={value}
      class="border-border bg-panel flex h-16 w-full min-w-0 flex-col justify-between rounded-lg border p-2"
      aria-hidden="true"
    >
      <span class="bg-base-content/60 h-2 w-2/3 rounded"></span>
      <span class="bg-canvas flex items-center gap-2 rounded p-2">
        <span class="bg-primary size-4 shrink-0 rounded-full"></span>
        <span class="bg-secondary size-4 shrink-0 rounded-full"></span>
        <span class="bg-tertiary size-4 shrink-0 rounded-full"></span>
      </span>
    </span>
  {:else}
    <span
      class="border-border bg-foreground/4 text-muted-foreground flex h-16 w-full items-center justify-center rounded-lg border border-dashed text-xs"
      >Automatic</span
    >
  {/if}
{/snippet}

{#snippet mapPreview(value: string)}
  {#if value}
    {#key value}
      <!-- Missing local renders retain a readable placeholder; changing style retries its image. -->
      <span
        class="border-border bg-foreground/4 relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border"
      >
        <span class="text-muted-foreground px-2 text-center text-xs"
          >Preview unavailable</span
        >
        <img
          src={getMapStyleRenderAssetPath(value)}
          alt=""
          loading="lazy"
          width="256"
          height="256"
          class="absolute inset-0 h-full w-full object-cover"
          onerror={event => {
            if (event.currentTarget instanceof HTMLElement)
              event.currentTarget.hidden = true
          }}
        >
      </span>
    {/key}
  {:else}
    <span
      class="border-border bg-foreground/4 text-muted-foreground flex h-16 w-full items-center justify-center rounded-lg border border-dashed text-xs"
      >Automatic</span
    >
  {/if}
{/snippet}

{#snippet textField(
  key: 'name' | 'username' | 'attribution' | 'email' | 'telephone' | 'image',
  label: string,
)}
  {#if draft}
    <TextInputField
      variant="resource"
      id={`${fieldId}-${key}`}
      {label}
      isEditing={editing}
      disabled={saving}
      value={draft[key] ?? ''}
      placeholder={editing ? 'Not provided' : '—'}
      issues={visibleFieldErrors[key] ? [visibleFieldErrors[key]] : undefined}
      errorId={`${fieldId}-${key}-error`}
      inputType={key === 'telephone' ? 'tel' : key === 'email' ? 'email' : 'text'}
      inputAttrs={{
        'aria-invalid': Boolean(visibleFieldErrors[key]),
        'aria-describedby': visibleFieldErrors[key]
          ? `${fieldId}-${key}-error`
          : undefined,
      }}
      onValueChange={value => {
        if (draft) draft[key] = value
        delete fieldErrors[key]
      }}
    />
  {/if}
{/snippet}

<Main.Form
  attrs={{
    onsubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void save()
    },
  }}
>
  <Main.Facet isVisible={activeFacet === 'profile'} fillHeight class="right-0! left-0!">
    <FormSurface>
      <UserProfileVisual
        profile={data.profile}
        {selectionEpoch}
        initialPreviews={data.contributionPreviews}
        avatar={avatarSelection?.url ?? draft?.image ?? data.profile.image}
        editing={editing && data.canEdit && !saving}
        onImageChange={selection => {
          discardAvatar()
          avatarSelection = selection
        }}
        onBusyChange={busy => (uploadingAvatar = busy)}
        onMore={() => selectFacet('contributions')}
      />
      {#if message}
        <p role="alert" class="px-6 pt-4 text-sm">{message}</p>
      {/if}
      {#if draft && data.canEdit}
        <div class="grid grid-cols-1 xl:grid-cols-3">
          <section aria-label="Names" class="min-w-0">
            <SectionHeader
              title="Names"
              icon={PersonIcon}
              class="h-[68px]! min-h-[68px]!"
            />
            <div class="space-y-4 px-6 py-6">
              {@render textField('name', 'Name')}
              {@render textField('username', 'Username')}
              {@render textField('attribution', 'Public attribution')}
            </div>
          </section>
          <section aria-label="Phone" class="xl:border-border/70 min-w-0 xl:border-l">
            <SectionHeader
              title="Phone"
              icon={PhoneIcon}
              class="h-[68px]! min-h-[68px]!"
            >
              {#snippet right()}
                <SimpleTooltip
                  triggerProps={{ 'aria-label': 'Phone number help', role: 'button' }}
                  contentClass="max-w-80 p-3 text-sm"
                >
                  {#snippet trigger()}
                    <InfoIcon class="text-muted-foreground size-4" />
                  {/snippet}
                  {#snippet children()}
                    <p>
                      Eight digits use Hong Kong (+852). Enter a separate number or
                      username for each service if needed.
                    </p>
                    <p class="mt-3">
                      Service details save with the profile and are restored by Reset.
                      Automatic account confirmation is a forthcoming feature.
                    </p>
                  {/snippet}
                </SimpleTooltip>
              {/snippet}
            </SectionHeader>
            <div class="space-y-4 px-6 py-6">
              {@render textField('telephone', 'Phone number')}
              <fieldset {disabled} class="min-w-0">
                <AdminUserMessagingFields
                  phoneNumber={draft.telephone ?? ''}
                  bind:value={messagingDraft}
                  {editing}
                  disabled={saving}
                  errors={visibleFieldErrors}
                  onChange={field => {
                    delete fieldErrors[field]
                  }}
                />
              </fieldset>
            </div>
          </section>
          <section aria-label="Web" class="xl:border-border/70 min-w-0 xl:border-l">
            <SectionHeader
              title="Web"
              icon={GlobeIcon}
              class="h-[68px]! min-h-[68px]!"
            />
            <div class="space-y-4 px-6 py-6">
              {@render textField('email', 'Email')}
              <UserLinkedAccounts accounts={data.linkedAccounts} />
            </div>
          </section>
        </div>
      {:else}
        <div class="p-6"><AdminUserProfileView {data} {model} /></div>
      {/if}
    </FormSurface>
  </Main.Facet>
  {#if data.canEdit && draft}
    <Main.Facet
      isVisible={activeFacet === 'advanced'}
      fillHeight
      class="right-0! left-0!"
    >
      <FormSurface>
        <section class="@container flex min-h-0 flex-col">
          {#if message}
            <p role="alert" class="px-6 py-3 text-sm">{message}</p>
          {/if}
          <!-- Keep related settings together as the available form width changes. -->
          <div
            class="grid min-w-0 grid-cols-1 @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-3"
          >
            <section aria-label="Language" class="border-border/70 min-w-0">
              <SectionHeader title="Language" icon={LanguagesIcon} />
              <div class="space-y-3 p-4">
                <section
                  aria-label="Languages"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    <LanguagesIcon class="size-4" />Languages
                  </h3>
                  <div class="min-w-0 space-y-3 px-4 py-3">
                    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span class="text-sm font-semibold">Interface language</span>
                      <Select
                        triggerAttrs={{ 'aria-label': 'Interface language' }}
                        value={draft.locale}
                        items={localeOptions.map(option => ({
                          value: option.tag,
                          label: option.autonym,
                        }))}
                        {disabled}
                        isEditing={editing}
                        variant="ghost"
                        class="w-auto! max-w-44 min-w-0"
                        triggerClass="h-auto min-h-8 gap-2 rounded-lg px-2 py-1 hover:bg-primary/10"
                        reserveTriggerSpace
                        onValueChange={value => {
                          if (draft) draft.locale = value as typeof draft.locale
                        }}
                      />
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold">Fallback languages</h4>
                      <p
                        class="text-muted-foreground mt-1 mb-2 text-xs leading-relaxed"
                      >
                        Languages to use when a translation is unavailable, in order of
                        preference.
                      </p>
                      <LocaleToolbar
                        selectedLocales={Array.isArray(preferences.fallbackLocales)
                          ? preferences.fallbackLocales
                          : []}
                        visibleLocales={Array.isArray(preferences.fallbackLocales)
                          ? preferences.fallbackLocales
                          : []}
                        options={localeOptions}
                        expanded
                        alwaysExpanded
                        allowAdd={!disabled}
                        {disabled}
                        mode="membership"
                        onExpandedChange={() => {}}
                        onChange={change =>
                          (preferences.fallbackLocales = change.selectedLocales)}
                      />
                    </div>
                  </div>
                </section>
                <section
                  aria-label="Translation"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Translation
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    {#each languageOptions as [key, label]}
                      {@render toggle(
                        label,
                        preferences[key] === true,
                        value => (preferences[key] = value),
                      )}
                    {/each}
                  </div>
                </section>
              </div>
            </section>
            <section
              aria-label="Layout and Style"
              class="border-border/70 min-w-0 @min-[40rem]:border-l"
            >
              <SectionHeader title="Layout and Style" icon={PaletteIcon} />
              <div class="space-y-3 p-4">
                <section
                  aria-label="Appearance"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border [&_.bits-form__select-label]:overflow-visible! [&_.bits-form__select-label]:text-clip! [&_.bits-form__select-label]:whitespace-normal!"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Appearance
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    <div class="space-y-2 py-3">
                      <h4 class="text-sm font-medium">Theme</h4>
                      <Select
                        placeholder="Default"
                        triggerAttrs={{ 'aria-label': 'Theme' }}
                        value={theme.uiTheme}
                        items={[
                          { value: '', label: 'Default' },
                          ...THEMES.map(option => ({
                            value: option.id,
                            label: option.name,
                          })),
                        ]}
                        {disabled}
                        isEditing={editing}
                        variant="ghost"
                        class="w-full! min-w-0"
                        triggerClass="h-auto min-h-20 rounded-lg px-2 py-2 hover:bg-primary/10"
                        displayClass="h-auto! min-h-20"
                        itemPreview={themePreview}
                        reserveTriggerSpace
                        onValueChange={value => (theme.uiTheme = value)}
                      />
                    </div>
                    <div class="space-y-2 py-3">
                      <h4 class="text-sm font-medium">Map style</h4>
                      <Select
                        placeholder="Default"
                        triggerAttrs={{ 'aria-label': 'Map style' }}
                        value={theme.mapStyle ?? ''}
                        items={[
                          { value: '', label: 'Default' },
                          ...MAP_STYLE_KEYS.map(value => ({
                            value,
                            label: getMapStyleCatalogCopy(value, 'en').name,
                          })),
                        ]}
                        {disabled}
                        isEditing={editing}
                        variant="ghost"
                        class="w-full! min-w-0"
                        triggerClass="h-auto min-h-20 rounded-lg px-2 py-2 hover:bg-primary/10"
                        displayClass="h-auto! min-h-20"
                        itemPreview={mapPreview}
                        reserveTriggerSpace
                        onValueChange={value => (theme.mapStyle = value)}
                      />
                    </div>
                    {@render toggle(
                      'Sync theme and map',
                      theme.syncUiAndMap,
                      value => (theme.syncUiAndMap = value),
                    )}
                    {@render toggle(
                      'Use active map style',
                      theme.useActiveMapStyle,
                      value => (theme.useActiveMapStyle = value),
                    )}
                  </div>
                </section>
                <section
                  aria-label="Admin layout"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Admin layout
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    {@render toggle(
                      'Collapse admin map',
                      adminPrefs.isAdminMapCollapsed,
                      value => (adminPrefs.isAdminMapCollapsed = value),
                    )}
                    {@render toggle(
                      'Collapse primary panel',
                      adminPrefs.isPrimaryPanelCollapsed,
                      value => (adminPrefs.isPrimaryPanelCollapsed = value),
                    )}
                    {@render toggle(
                      'Auto-hide primary panel',
                      adminPrefs.isPrimaryPanelAutoHide,
                      value => (adminPrefs.isPrimaryPanelAutoHide = value),
                    )}
                  </div>
                </section>
              </div>
            </section>
            <section
              aria-label="Miscellaneous"
              class="border-border/70 min-w-0 @min-[60rem]:border-l"
            >
              <SectionHeader title="Miscellaneous" icon={SlidersIcon} />
              <div class="space-y-3 p-4">
                <section
                  aria-label="Contributions"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Contributions
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    {@render toggle(
                      'Filter contributions by selected scope',
                      contributionPrefs.observePrisms,
                      value => (contributionPrefs.observePrisms = value),
                    )}
                    {@render toggle(
                      'Show all contributions',
                      contributionPrefs.showAll,
                      value => (contributionPrefs.showAll = value),
                    )}
                  </div>
                </section>
                <section
                  aria-label="Account"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Account
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    {@render toggle('Archived account', draft.isArchived, value => {
                      if (draft) draft.isArchived = value
                    })}
                    {@render toggle(
                      'Email verified',
                      draft.emailVerified,
                      value => {
                        if (draft) draft.emailVerified = value
                      },
                      !superAdmin,
                    )}
                  </div>
                </section>
                <section
                  aria-label="Experimental features"
                  class="border-border bg-foreground/4 min-w-0 self-start rounded-xl border"
                >
                  <h3
                    class="border-border/50 flex min-h-10 items-center gap-2 border-b px-4 py-2 text-sm font-semibold"
                  >
                    Experimental features
                  </h3>
                  <div class="divide-border/20 min-w-0 divide-y px-4">
                    {@render toggle(
                      'Contributor mode',
                      experimental.contributorMode === true,
                      value => (experimental.contributorMode = value),
                    )}
                    {@render toggle(
                      'Hide map labels',
                      experimental.noLabelsMode === true,
                      value => (experimental.noLabelsMode = value),
                    )}
                  </div>
                </section>
              </div>
            </section>
          </div>
        </section>
      </FormSurface>
    </Main.Facet>
  {/if}
  <Main.Facet isVisible={activeFacet === 'access'} fillHeight class="right-0! left-0!">
    <FormSurface><UserAccess access={data.access} /></FormSurface>
  </Main.Facet>
  <UserContributionsDashboard
    {data}
    {model}
    isVisible={activeFacet === 'contributions'}
  />
  {#if data.canViewChangelog && activeFacet === 'changelog'}
    <Main.Facet
      isVisible
      fillHeight
      edgeToEdge
      contentClass="h-full overflow-hidden"
      class="right-0! left-0!"
    >
      <FormSurface class="mb-0! flex h-full min-h-0 flex-col">
        <UserChangelog userId={data.profile.id} />
      </FormSurface>
    </Main.Facet>
  {/if}
</Main.Form>
