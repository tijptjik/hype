//! Bounded source locations and allowlisted failure categories, never SDK text.
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

struct Locations(Mutex<Vec<String>>);
static LOCATIONS: Locations = Locations(Mutex::new(Vec::new()));

pub fn record_transport(phase: &str, status: u16) {
    let mut rows = LOCATIONS.0.lock().unwrap();
    if rows.len() == 16 {
        rows.remove(0);
    }
    rows.push(format!("host:{phase} status:{status}"));
}

impl log::Log for Locations {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Warn
    }
    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            let mut rows = self.0.lock().unwrap();
            if rows.len() == 16 {
                rows.remove(0);
            }
            rows.push(format!(
                "{} {}:{}",
                record.level(),
                record.file().unwrap_or("unknown"),
                record.line().unwrap_or(0)
            ));
            if record
                .file()
                .is_some_and(|file| file.ends_with("/client/lifecycle.rs"))
            {
                // Inspect in memory, emit only fixed categories. SDK causes can
                // contain URLs and tokens, so never return their formatted text.
                let message = record.args().to_string();
                let category = [
                    ("failed to resolve app version", "version-resolution"),
                    ("failed to open transport", "transport-open"),
                    ("Core handshake error", "noise-handshake"),
                    (
                        "Unexpected event during handshake",
                        "unexpected-handshake-event",
                    ),
                    ("transport connect timed out", "transport-timeout"),
                    ("version fetch timed out", "version-timeout"),
                ]
                .into_iter()
                .find(|(needle, _)| message.contains(needle));
                if let Some((_, category)) = category {
                    rows.last_mut().unwrap().push_str(&format!(" [{category}]"));
                }
                for needle in [
                    "could not find",
                    "could not decode",
                    "CertVerification",
                    "certificate",
                    "Cloudflare host I/O failed",
                ] {
                    if message.contains(needle) {
                        rows.last_mut().unwrap().push_str(&format!(" [{needle}]"));
                    }
                }
            }
        }
    }
    fn flush(&self) {}
}

pub fn initialize() {
    let _ = log::set_logger(&LOCATIONS);
    log::set_max_level(log::LevelFilter::Warn);
}

#[wasm_bindgen(js_name = diagnosticLocations)]
pub fn diagnostic_locations() -> String {
    serde_json::to_string(&*LOCATIONS.0.lock().unwrap()).unwrap()
}
