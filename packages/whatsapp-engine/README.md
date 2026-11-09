# HYPE WhatsApp engine

Private Rust/WASM implementation for `workers/whatsapp`. It owns the Workers storage,
networking, media and call adapters and pins `whatsapp-rust` independently in
Cargo.toml/Cargo.lock. It contains no desktop CLI, native account store or installer.
TjikOS owns the independent `whatsover` desktop product.

Requires Rust with the `wasm32-unknown-unknown` target, Bun, and `wasm-bindgen-cli`
0.2.130. From the HYPE root:

```sh
bun install
bunx turbo run build --filter=@hype/whatsapp
bunx turbo run test --filter=@hype/whatsapp
```

The build generates `dist/whatsapp_engine_bg.wasm`, bindings and a static factory with
separate memory and JS handles for each Durable Object. Builds never deploy. The
WhatsApp test task enables the synthetic `qualification` feature. Always run the normal
build before an explicit deployment to remove qualification exports.

Both products currently pin the same upstream revision. This is a migration starting
point, not a requirement to update or release them together. Changes to HYPE's code or
Cargo.lock do not alter TjikOS's client.
