fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        // Android devices with 16 KB pages require every ELF LOAD segment to align.
        println!("cargo:rustc-link-arg-cdylib=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
