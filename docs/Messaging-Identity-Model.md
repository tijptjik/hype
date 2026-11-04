# Messaging preferences and recipient identities

The main HYPE database owns recipient preferences and identity associations. Linked
Telegram/WhatsApp account credentials remain in the private messaging bridges. Each
account is assigned to exactly one organisation for access control; the provider account
owns its native chats. Chats have no separate organisation association.

| Record                            | Key                                           | Responsibility                                                                                                                                           |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.preferredMessagingPlatform` | User ID                                       | Nullable `whatsapp` / `telegram` preference for new outreach. Null uses WhatsApp as the application default.                                             |
| `userMessagingIdentity`           | `(userId, platform)`                          | Independently nullable `phoneNumber`, `username`, and `nativeId`, plus verification and discovery provenance.                                            |
| `userMessagingIdentityAlias`      | `(platform, nativeId)`                        | Unique ownership of verified provider IDs and aliases, linked to the user's platform identity.                                                           |
| `messagingAccount`                | Account ID; unique provider identity          | Linked Telegram/WhatsApp account, assigned to one organisation for operator access.                                                                      |
| `messagingConversation`           | Conversation ID; unique `(accountId, chatId)` | Account-owned native chat imported from the provider or opened in HYPE. An optional `recipientUserId` enriches the chat; it does not control visibility. |

Phone numbers use international `+` notation. Usernames are stored without `@` and
normalized to lowercase. Native IDs remain strings, including numeric Telegram IDs and
WhatsApp phone/LID addresses. A messaging phone may differ from `user.telephone`; a
provider may also withhold it. Saving a phone or username does not infer a trusted
native ID.

Changes to the saved identifier fields clear ownership verification and routing aliases.
Verification requires a global administrator's independent ownership confirmation and
resolves every supplied lookup to the same provider account. The saved revision is
checked again when committing, so an edit during provider lookup cannot be overwritten.
Provider metadata fills the separate contact fields; privacy-hidden values do not erase
the submitted identifiers. Alias ownership and verification commit atomically. A
conflicting alias rolls back the verification.

Migration-created triggers keep the canonical ID in the alias table whenever an identity
is verified, and clear aliases when verification is removed, renewed, or the canonical
ID changes. Provider-confirmed aliases are added in the same verification batch. HYPE
association checks the current verification, profile-phone provenance, active HYPE user,
and any existing thread owner before accepting an alias. Account access permits reading
and replying to existing native chats even without a verified HYPE association.
Arbitrary new external addresses remain disallowed; new HYPE-user outreach still
requires a verified destination.

Automatic discovery continues to use the saved HYPE profile phone. Its raw value is
retained in `sourceTelephone`, and changing that profile value invalidates the
association. A pending manual messaging claim requires ownership verification; automatic
discovery does not replace it with another profile phone's account.

New outreach and directory results prefer the user's configured platform, falling back
to the other reachable platform once the preferred platform's check finishes. An
explicit platform selection takes precedence. Existing threads and recorded sends retain
their original route.

## Account inbox

The inbox includes recent native chats from both linked accounts, including chats
started outside the web UI, unlinked contacts, groups, and channels. Telegram dialog
discovery runs on connection; WhatsApp uses the linked bridge’s synced history. Stored
chats and Telegram dialogs can be paged with **Load more chats**. History availability
remains bounded by what the provider supplies to the linked session. Opening a chat also
loads its recent saved messages immediately, without advancing past other chats awaiting
account replay. Provider aliases may enrich its display profile but do not rewrite the
native chat ID used to read or reply.

Unmatched contacts have a subtle red avatar ring in the list, with a **Not linked to
HYPE** tooltip and accessible label. The conversation header retains the explicit label.
This means there is no verified HYPE association, not proof that the person has no HYPE
account. Provider usernames are labelled Telegram/WhatsApp; group chats are labelled
separately. Native names and previews remain available from saved history. Notifications
follow account access as well and include unlinked contacts.

Previews, unread counts, and fallback names are scoped to the exact account/chat pair,
including when different accounts share the same native chat ID.

**Pin chat** and **Unpin chat** in the context menu persist shared HYPE account-inbox
state. Pinned chats stay above unpinned chats regardless of message recency, with most
recently pinned first. Pinning preserves the current selection and draft and does not
modify native Telegram or WhatsApp pins.

## Migration and validation

`0165_user_messaging_identifiers.sql` copies the scalar preference to `user`, preserves
the latest user/preference update timestamp, and removes the old preference table. It
classifies legacy addresses into the separate identifier fields, preserving verification
and `sourceTelephone`. It leaves conversation IDs, native chat IDs, messages, accounts,
and sends unchanged. Previously overwritten usernames or phone numbers cannot be
recovered from SQL; later verification can enrich them from the provider. An
unclassifiable legacy row fails the migration instead of being discarded.

`0166_messaging_discovered_phone_format.sql` normalizes the legacy discovered-phone
backfill, including Hong Kong national numbers and `00` international prefixes. It only
updates numbers that still match the original profile-phone backfill, preserving
independently edited messaging numbers and exact discovery provenance.

`0167_messaging_conversation_pins.sql` adds nullable `pinnedAt` and the inbox sorting
index without changing existing chat routes or messages.

Apply through the D1 migration runner's transaction boundary after backing up the
target. Deploy the matching application and notification worker code together with this
schema change: older code expects the removed preference table and `address` column. The
notification worker checks operator access to the assigned organisation and includes all
eligible incoming account chats, independently of HYPE matching. The local phone-lookup
backfill also uses the new identifiers and skips pending manual claims.

Regression coverage lives in `src/tests/messaging-identifiers.migration.test.ts`,
`src/tests/messaging.integration.test.ts`, `src/tests/messaging-inbox-model.test.ts`,
`workers/messaging-notifications/notifications.test.ts`, and
`scripts/messaging/phone-lookup-queries.test.ts`.
