# Hype Recorder

Recorder is the Android field-recording client in HYPE’s Bun workspace. After sign-in,
it lists the contributor’s shared field sessions in most-recently-updated order.
Development is focused on this Android client; the separate web capture demo at
`/recorder/:session` is paused and documented on the `feature/field-work` branch. The
browser-based device sign-in flow remains part of Android Recorder.

## Sessions and records

The welcome screen uses each session’s internal name. The server checks project
contribution scope for every session read and record creation. Project owners and
maintainers share their project’s sessions, organisation owners inherit access across
their projects, and hub admins inherit access across their hub. Archived sessions are
hidden. Completed sessions retain their record list.

Tap a selector to open its choices, or swipe up or down to step through them. The
location search includes the premises, buildings and building parts assigned in Field
Sessions administration. Selecting a part also displays its known building or premises.
Record creates an unpublished Feature using the selected layer's session defaults, then
opens its editor. Status starts collapsed with summary tags; Fields starts expanded. The
editor supports selections, text, numbers, dates, booleans, multiple phone numbers,
labelled links, and date/time ranges. Save changes persists a versioned revision. Draft
marks unfinished work and does not control publication. Queue for review is an
independent flag. Published or linked Features use HYPE's editorial workflow. See
Records lists the resulting Feature titles and reopens their editors. Each capture
retains its session link and retry identity. Sessions with an older schema can be
browsed while a manager reviews the upgrade in Field Sessions.

Apply `0265_field_research_record.sql` and `0266_field_research_features.sql` to the
target development database before testing Feature creation. Apply
`0267_field_research_record_placement.sql` for realm, Location and map pins.

Android Back returns through the location picker, records and launch screen to the
sessions overview. The launch screen has an Interior/Exterior selector and a map button
beside search. Flick the map’s Location selector vertically to move between places, or
tap it to open the list. Interior shows the linked published floors in 3D with their
reference artwork. Choose a floor for a top-down pin or use 3D to return to the stack.
Exterior shows the linked building model with its textures above the Lands Department
street map, where you can place a geographic pin.

A capture stores its selected realm and Location. Interior pins retain the map ID,
immutable release hash, floor ID and source coordinates. Exterior pins retain longitude
and latitude. See Records can reopen a saved pin on its original drawing. Interior is
the initial realm for each session.

The bottom menu uses the account avatar and reveals account details and Sign out. It
hides when scrolling down and returns when scrolling up. Google avatar image hosts are
explicitly permitted by the native CSP; unavailable images use the user icon.

## Android development

From the repository root, install dependencies with `bun install --frozen-lockfile`.
Android development requires JDK 21, the Android 37 SDK, an NDK, and the Rust target for
your device. Set `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` for the native toolchain.
The Android Studio project is checked in.

From `apps/recorder`, use `bun run tauri android dev` with an attached device, or
`bun run tauri android build --debug --apk --target aarch64` to build an arm64 debug
APK. The Svelte frontend and Rust mobile entry point are shared with a future iOS
target.

## Authentication and remote functions

Build Fi’s Android client with `bun run android:fi` from `apps/recorder`. Connect the
phone to the tailnet. This build uses `https://fi.tailb49776.ts.net:9443` for both
native requests and browser approval. On Fi, run `bun run dev:offline` from the
repository root with the Recorder migration applied locally. Tailscale Serve proxies
tailnet HTTPS port 9443 to `http://localhost:5175`.

The production app targets `https://hype.hk`. Release the web changes and apply
`migrations/0260_recorder_device_code.sql` to the same HYPE database before pairing a
device against that host. The device opens the existing HYPE sign-in flow in the system
browser. After the contributor compares the pairing code and approves it, Better Auth
issues an independent session for the same user. The native HTTP cookie jar carries this
session across requests. Sign-out revokes the device session.

The remote transport follows
[Robin Braemer’s static-to-remote example](https://github.com/robinbraemer/sveltekit-static-to-remote).
Keep the client declaration and web implementation at the same project-relative path,
with matching export names, and use the same locked SvelteKit version. Recorder forwards
generated requests under `/_app/remote/` through the scoped Tauri HTTP plugin. The web
server hooks import the Recorder account and session modules so SvelteKit includes their
handlers in the server manifest.
