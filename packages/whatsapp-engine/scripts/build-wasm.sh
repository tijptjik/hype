#!/usr/bin/env bash
set -euo pipefail
engine_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg getrandom_backend=\"wasm_js\""
features="wasm"
if [[ "${WHATSAPP_QUALIFICATION:-0}" == "1" ]]; then features="wasm,qualification"; fi
cargo build --manifest-path "$engine_dir/Cargo.toml" --locked --no-default-features --features "$features" --target wasm32-unknown-unknown --release
build_dir="${CARGO_TARGET_DIR:-$engine_dir/target}"
wasm-bindgen "$build_dir/wasm32-unknown-unknown/release/whatsapp_engine.wasm" --target web --out-dir "$engine_dir/dist"
bun "$engine_dir/scripts/wrap-bindings.ts"
