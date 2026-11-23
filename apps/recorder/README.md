# Hype Recorder

Recorder is the Android field-recording client in HYPE’s Bun workspace. This first
version connects a contributor’s HYPE account. Development is focused on this Android
client; the separate web capture demo at `/recorder/:session` is paused and documented
on the `feature/field-work` branch. The browser-based device
sign-in flow remains part of Android Recorder.

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
server hooks import the account query so SvelteKit includes its handler in the server
manifest.
