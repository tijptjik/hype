// CONTEXT
import { UserFeatureCollections } from './userFeatureCollections.svelte.js'
// TYPES
import type { SessionUser } from '#lib/types.js'
import type {
  CurrentUser,
  UserLayer,
  UserProfile,
} from '#lib/db/zod/schema/user.types.js'

// Profile responses may enrich presentation, but cannot replace session identity or roles.
const PROFILE_FIELDS = [
  'name',
  'username',
  'displayUsername',
  'image',
  'attribution',
  'locale',
  'preferences',
  'experimental',
  'userLayers',
  'userFeatures',
  'contributedFeatures',
  'contributedImages',
  'reportedMissingCount',
  'newPhotoCount',
  'newFeatureCount',
] as const

type ProfileData = Partial<Pick<CurrentUser, (typeof PROFILE_FIELDS)[number]>>
export type AccountUser = Readonly<
  Omit<SessionUser, keyof ProfileData> &
    ProfileData & {
      userLayers: UserLayer[]
    }
>

/** Root-owned session identity and separately loaded self-profile data. */
export class AccountState {
  readonly collections = new UserFeatureCollections()
  private sessionState: SessionUser | null = $state.raw(null)
  private profile: ProfileData = $state({})
  private scope = ''
  private revisionState = $state(0)

  /** Creates an isolated account store. @param session Initial authoritative session. */
  constructor(session: SessionUser | null = null) {
    this.syncSession(session)
  }

  /** Identifies the current account lifetime. @returns Revision used to reject stale asynchronous writes. */
  get revision(): number {
    return this.revisionState
  }

  /** Returns authoritative identity without profile enrichment. @returns Current session user. */
  get session(): Readonly<SessionUser> | null {
    return this.sessionState
  }

  /** Combines presentation data with authoritative identity. @returns A read-only user snapshot. */
  get user(): AccountUser | null {
    if (!this.sessionState) return null
    return {
      ...this.sessionState,
      ...this.profile,
      userLayers: this.profile.userLayers ?? [],
    }
  }

  /**
   * Publishes a session and discards enrichment when its authorization scope changes.
   * @param session Authoritative authentication payload, never a profile response.
   * @returns Nothing.
   */
  syncSession(session: SessionUser | null): void {
    const scope = JSON.stringify([
      session?.id,
      session?.isAnonymous,
      session?.superAdmin,
      [...(session?.roles ?? [])].map(role => JSON.stringify(role)).sort(),
    ])
    if (scope !== this.scope) {
      this.collections.reset()
      this.profile = {}
      this.revisionState += 1
      this.scope = scope
    }
    if (JSON.stringify(this.sessionState) !== JSON.stringify(session)) {
      this.sessionState = session
    }
  }

  /**
   * Applies self-profile fields without accepting identity or authorization fields.
   * @param profile Persisted profile or preference fields.
   * @param revision Account revision captured before asynchronous work, if applicable.
   * @returns Whether the update belongs to the current account.
   * @remarks Other users' profiles remain in their panel/cache; they never enrich this store.
   */
  applyProfile(
    profile: Partial<CurrentUser> | UserProfile,
    revision = this.revision,
  ): boolean {
    if (!this.sessionState || revision !== this.revision) return false
    if (
      'id' in profile &&
      profile.id !== undefined &&
      profile.id !== this.sessionState.id
    )
      return false
    // Whitelist fields at runtime too: remote payloads cannot override roles or account identity.
    const entries = PROFILE_FIELDS.flatMap(key => {
      if (!(key in profile)) return []
      const value = profile[key as keyof typeof profile]
      return value === undefined ? [] : [[key, value]]
    })
    this.profile = { ...this.profile, ...Object.fromEntries(entries) }
    return true
  }
}
