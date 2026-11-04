//! Single-threaded Workers adapters. No Tokio, native sockets, or filesystem.
mod calls;
mod diagnostics;
#[cfg(feature = "qualification")]
mod qualification;
mod relay;
mod storage;
use whatsapp_rust::prelude::{MessageBuilderExt, MessageExt, Event, EventHandler};
use wacore::types::presence::ReceiptType;
use whatsapp_rust::wacore_binary::JidExt;
use crate::{Claim, Engine, InboxMessage, Journal, Outbound, TextRequest};
use anyhow::{Result, anyhow};
use bytes::Bytes;
use futures::future::{AbortHandle as FutureAbort, Abortable};
use js_sys::{Function, Promise, Reflect, Uint8Array};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    time::Duration,
};
use wacore::{
    net::{
        DisconnectReason, HttpClient, HttpRequest, HttpResponse, Transport, TransportEvent,
        TransportFactory,
    },
    runtime::{AbortHandle, Runtime},
};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::{JsFuture, spawn_local};
use whatsapp_rust::prelude::{Bot, DrainOutcome};

#[wasm_bindgen(module = "/src/host.js")]
extern "C" {
    type Socket;
    #[wasm_bindgen(js_name = dial)]
    fn dial(callback: &Function) -> Socket;
    #[wasm_bindgen(method, getter)]
    fn ready(this: &Socket) -> Promise;
    #[wasm_bindgen(method, catch)]
    fn send(this: &Socket, data: &[u8]) -> std::result::Result<(), JsValue>;
    #[wasm_bindgen(method)]
    fn close(this: &Socket);

    type HttpOperation;
    #[wasm_bindgen(js_name = request)]
    fn request(metadata: &str, body: Option<Uint8Array>) -> HttpOperation;
    #[wasm_bindgen(method, getter)]
    fn response(this: &HttpOperation) -> Promise;
    #[wasm_bindgen(method)]
    fn cancel(this: &HttpOperation);
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance, js_name = now)]
    fn monotonic_millis() -> f64;
}

struct WorkerClock;

impl wacore::time::TimeProvider for WorkerClock {
    fn now_millis(&self) -> i64 {
        js_sys::Date::now() as i64
    }
}

struct WorkerMonotonic(Mutex<u64>);

impl wacore::time::MonotonicProvider for WorkerMonotonic {
    fn now_nanos(&self) -> u64 {
        // Workers advances time at I/O boundaries. Clamp even if the host clock
        // is adjusted; SDK timeout measurements must never move backwards.
        let raw = (monotonic_millis() * 1_000_000.0) as u64;
        let mut last = self.0.lock().unwrap();
        *last = (*last).max(raw);
        *last
    }
}

/// Install clocks once per WASM instance, before any SDK object is constructed.
#[wasm_bindgen(start)]
pub fn initialize_runtime() -> std::result::Result<(), JsValue> {
    wacore::time::set_time_provider(WorkerClock).map_err(JsValue::from_str)?;
    wacore::time::set_monotonic_provider(WorkerMonotonic(Mutex::new(0)))
        .map_err(JsValue::from_str)?;
    Ok(())
}

// Avoid propagating JS error strings: upstream URLs can contain media tokens.
fn io_error(error: JsValue) -> anyhow::Error {
    let phase = Reflect::get(&error, &"whatsoverPhase".into())
        .ok()
        .and_then(|v| v.as_string());
    if let Some(phase) = phase.filter(|phase| {
        matches!(
            phase.as_str(),
            "websocket-fetch"
                | "websocket-upgrade"
                | "websocket-configure"
                | "websocket-accept"
                | "websocket-notify"
        )
    }) {
        let status = Reflect::get(&error, &"whatsoverHttpStatus".into())
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as u16;
        diagnostics::record_transport(&phase, status);
    }
    anyhow!("Cloudflare host I/O failed")
}

pub struct WorkerRuntime;

impl Runtime for WorkerRuntime {
    fn spawn(&self, future: Pin<Box<dyn Future<Output = ()> + 'static>>) -> AbortHandle {
        let (abort, registration) = FutureAbort::new_pair();
        spawn_local(async move {
            let _ = Abortable::new(future, registration).await;
        });
        AbortHandle::new(move || abort.abort())
    }

    fn sleep(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()>>> {
        Box::pin(async move {
            let mut millis = duration.as_millis();
            loop {
                let part = millis.min(i32::MAX as u128) as u32;
                gloo_timers::future::TimeoutFuture::new(part).await;
                millis -= part as u128;
                if millis == 0 {
                    break;
                }
            }
        })
    }

    fn spawn_blocking(&self, f: Box<dyn FnOnce() + 'static>) -> Pin<Box<dyn Future<Output = ()>>> {
        // WASM has one thread. Yield before bounded CPU work; never invent threads.
        Box::pin(async move {
            gloo_timers::future::TimeoutFuture::new(0).await;
            f();
        })
    }

    fn yield_now(&self) -> Option<Pin<Box<dyn Future<Output = ()>>>> {
        Some(self.sleep(Duration::ZERO))
    }
    fn yield_frequency(&self) -> u32 {
        1
    }
}

pub struct WorkerTransportFactory;

struct WorkerTransport {
    socket: Socket,
    // JS must detach its callback before the Rust closure is freed.
    _callback: Closure<dyn FnMut(JsValue)>,
}

impl Drop for WorkerTransport {
    fn drop(&mut self) {
        self.socket.close();
    }
}

#[async_trait::async_trait(?Send)]
impl Transport for WorkerTransport {
    async fn send(&self, data: Bytes) -> Result<()> {
        self.socket.send(&data).map_err(io_error)
    }
    async fn disconnect(&self) {
        self.socket.close();
    }
}

#[async_trait::async_trait(?Send)]
impl TransportFactory for WorkerTransportFactory {
    async fn create_transport(
        &self,
    ) -> Result<(Arc<dyn Transport>, async_channel::Receiver<TransportEvent>)> {
        let (tx, rx) = async_channel::bounded(4);
        let callback = Closure::<dyn FnMut(JsValue)>::new(move |data: JsValue| {
            let event = if data.is_instance_of::<js_sys::ArrayBuffer>() {
                let bytes = Uint8Array::new(&data);
                if bytes.length() > 4 * 1024 * 1024 {
                    tx.close();
                    return;
                }
                TransportEvent::DataReceived(Bytes::from(bytes.to_vec()))
            } else if data.as_string().as_deref() == Some("connected") {
                TransportEvent::Connected
            } else {
                TransportEvent::Disconnected(DisconnectReason::StreamEnded)
            };
            // Overflow terminates this receiver; the SDK reconnects rather than
            // continuing a Noise stream with silently missing frames.
            if tx.try_send(event).is_err() {
                tx.close();
            }
        });
        let transport = WorkerTransport {
            socket: dial(callback.as_ref().unchecked_ref()),
            _callback: callback,
        };
        // The transport guard closes even a still-pending dial on cancellation.
        JsFuture::from(transport.socket.ready())
            .await
            .map_err(io_error)?;
        Ok((Arc::new(transport), rx))
    }
}

pub struct WorkerHttp;
struct HttpGuard(HttpOperation);
impl Drop for HttpGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

#[async_trait::async_trait(?Send)]
impl HttpClient for WorkerHttp {
    async fn execute(&self, input: HttpRequest) -> Result<HttpResponse> {
        let metadata = serde_json::to_string(
            &serde_json::json!({"url": input.url, "method": input.method, "headers": input.headers}),
        )?;
        let body = input.body.as_ref().map(|b| Uint8Array::from(b.as_ref()));
        let guard = HttpGuard(request(&metadata, body));
        let result = JsFuture::from(guard.0.response()).await.map_err(io_error)?;
        let status = Reflect::get(&result, &"status".into())
            .map_err(io_error)?
            .as_f64()
            .ok_or_else(|| anyhow!("missing response status"))? as u16;
        let body = Reflect::get(&result, &"body".into()).map_err(io_error)?;
        Ok(HttpResponse::new(status, Uint8Array::new(&body).to_vec()))
    }
}

/// Shared validation exported for the Worker HTTP/RPC boundary.
#[wasm_bindgen(js_name = validateTextRequest)]
pub fn validate_text_request(json: &str) -> std::result::Result<String, JsValue> {
    let validate = || -> Result<String> {
        let input: crate::TextRequest = serde_json::from_str(json)?;
        Ok(serde_json::to_string(&input.validated()?)?)
    };
    validate().map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Return safe UI fields for both old and newly stored messages.
#[wasm_bindgen(js_name = projectMessage)]
pub fn project_message(payload: &str) -> std::result::Result<String, JsValue> {
    crate::content::project_stored(payload)
        .and_then(|value| Ok(serde_json::to_string(&value)?))
        .map_err(|_| JsValue::from_str("message projection failed"))
}

/// Exercise the same timer/randomness primitives the engine needs in workerd.
#[wasm_bindgen(js_name = probeRuntime)]
pub async fn probe_runtime() -> std::result::Result<String, JsValue> {
    let wall_start = wacore::time::now_millis();
    let start = wacore::time::Instant::now();
    WorkerRuntime.sleep(Duration::from_millis(20)).await;
    let wall_end = wacore::time::now_millis();
    let clocks = wall_start > 1_700_000_000_000
        && wall_end >= wall_start
        && start.elapsed() >= Duration::from_millis(1)
        && (wall_end as f64 - js_sys::Date::now()).abs() < 1_000.0;
    let device = wacore::store::Device::new();
    Ok(
        serde_json::json!({"runtime": "wasm32", "registrationId": device.registration_id, "clocks": clocks})
            .to_string(),
    )
}

#[wasm_bindgen]
extern "C" {
    pub type JournalHost;
    #[wasm_bindgen(method, catch, js_name = archiveUpdate)]
    fn archive_update_js(this: &JournalHost, json: &str) -> std::result::Result<(), JsValue>;
    #[wasm_bindgen(method, catch, js_name = receipt)]
    fn receipt_js(this: &JournalHost, json: &str) -> std::result::Result<(), JsValue>;
    #[wasm_bindgen(method, js_name = attachment)]
    fn attachment_js(this: &JournalHost, id: &str) -> Promise;
    #[wasm_bindgen(method, js_name = lookup)]
    fn lookup_js(this: &JournalHost, chat: &str, sender: &str, id: &str) -> Promise;
    #[wasm_bindgen(method, js_name = receive)]
    fn receive_js(this: &JournalHost, json: &str) -> Promise;
    #[wasm_bindgen(method, js_name = claim)]
    fn claim_js(this: &JournalHost, json: &str) -> Promise;
    #[wasm_bindgen(method, js_name = finish)]
    fn finish_js(this: &JournalHost, json: &str) -> Promise;
}

/// Receipt callbacks persist synchronously in the owning Durable Object, before later I/O.
struct WorkerReceipts(send_wrapper::SendWrapper<JournalHost>, Arc<AtomicBool>);
impl EventHandler for WorkerReceipts {
    fn handle_event(&self, event: Arc<Event>) {
        if let Event::ArchiveUpdate(update) = &*event {
            if let Some(archived) = update.action.archived {
                let chats = vec![update.jid.to_non_ad_string()];
                if self.0.archive_update_js(&serde_json::json!({ "chats": chats, "isArchived": archived }).to_string()).is_err() {
                    // A failed consumer write needs a full replay, even if the SDK advanced its version.
                    self.1.store(true, Ordering::Relaxed);
                }
            }
            return;
        }
        let Event::Receipt(receipt) = &*event else { return; };
        // Own read-sync and group partial reads must never mark a direct recipient as having read.
        if receipt.source.is_group || receipt.source.chat.is_group() || receipt.source.chat.is_status_broadcast() { return; }
        let state = match receipt.r#type {
            ReceiptType::ReadSelf | ReceiptType::PlayedSelf => "readByMe",
            ReceiptType::Delivered if !receipt.source.is_from_me => "delivered",
            ReceiptType::Read | ReceiptType::Played if !receipt.source.is_from_me => "read",
            _ => return,
        };
        let mut chats = vec![receipt.source.chat.to_non_ad_string()];
        if let Some(alias) = &receipt.source.sender_alt {
            let alias = alias.to_non_ad_string();
            if !chats.contains(&alias) { chats.push(alias); }
        }
        let ids: Vec<String> = receipt.message_ids.iter().map(ToString::to_string).collect();
        let _ = self.0.receipt_js(&serde_json::json!({"chats": chats, "ids": ids, "state": state}).to_string());
    }
}

struct WorkerJournal(JournalHost);
#[async_trait::async_trait(?Send)]
impl Journal for WorkerJournal {
    async fn attachment(&self, id: &str) -> Result<Option<String>> {
        let result = JsFuture::from(self.0.attachment_js(id))
            .await
            .map_err(io_error)?;
        Ok(result.as_string())
    }

    async fn lookup(
        &self,
        chat: &str,
        target: &crate::content::MessageTarget,
    ) -> Result<Option<InboxMessage>> {
        let result = JsFuture::from(self.0.lookup_js(chat, &target.sender, &target.id))
            .await
            .map_err(io_error)?;
        serde_json::from_str(
            &result
                .as_string()
                .ok_or_else(|| anyhow!("invalid journal response"))?,
        )
        .map_err(Into::into)
    }

    async fn receive(&self, messages: Vec<InboxMessage>) -> Result<()> {
        JsFuture::from(self.0.receive_js(&serde_json::to_string(&messages)?))
            .await
            .map_err(io_error)?;
        Ok(())
    }
    async fn claim(&self, request: TextRequest) -> Result<Claim> {
        let candidate = Outbound {
            message_id: request.message_id(),
            request,
            state: crate::SendState::Pending,
        };
        let result = JsFuture::from(self.0.claim_js(&serde_json::to_string(&candidate)?))
            .await
            .map_err(io_error)?;
        #[derive(serde::Deserialize)]
        struct Claimed {
            fresh: bool,
            outbound: Outbound,
        }
        let claim: Claimed = serde_json::from_str(
            &result
                .as_string()
                .ok_or_else(|| anyhow!("invalid journal response"))?,
        )?;
        Ok(if claim.fresh {
            Claim::New(claim.outbound)
        } else {
            Claim::Existing(claim.outbound)
        })
    }
    async fn finish(&self, outbound: Outbound) -> Result<()> {
        JsFuture::from(self.0.finish_js(&serde_json::to_string(&outbound)?))
            .await
            .map_err(io_error)?;
        Ok(())
    }
}

#[wasm_bindgen]
pub struct WorkerSession {
    engine: Engine,
    voice: calls::VoiceController,
    archive_dirty: Arc<AtomicBool>,
}

#[wasm_bindgen(js_name = startSession)]
pub async fn start_session(
    database: storage::Database,
    journal: JournalHost,
    device_name: Option<String>,
) -> std::result::Result<WorkerSession, JsValue> {
    diagnostics::initialize();
    let offers = calls::Offers::default();
    let archive_dirty = Arc::new(AtomicBool::new(false));
    let builder = Bot::builder()
        .with_device_props(
            wacore::store::DevicePropsOverride::new()
                .with_os(device_name.unwrap_or_else(|| "HYPE".into()))
                .with_platform_type(waproto::whatsapp::device_props::PlatformType::DESKTOP),
        )
        .with_backend(storage::DoBackend::new(database))
        .with_runtime(WorkerRuntime)
        .with_transport_factory(WorkerTransportFactory)
        .with_http_client(WorkerHttp)
        .with_event_handler(offers.clone())
        .with_event_handler(WorkerReceipts(send_wrapper::SendWrapper::new(journal.clone().unchecked_into()), archive_dirty.clone()));
    let engine = Engine::start(builder, Arc::new(WorkerJournal(journal)))
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let voice = calls::VoiceController::new(engine.client.clone(), offers);
    Ok(WorkerSession { engine, voice, archive_dirty })
}

#[wasm_bindgen]
impl WorkerSession {
    /// Report a host projection failure so a later snapshot can repair the archive mirror.
    #[wasm_bindgen(js_name = archiveNeedsSync)]
    pub fn archive_needs_sync(&self) -> bool { self.archive_dirty.load(Ordering::Relaxed) }

    /// Refresh native folder membership for existing sessions once the host projection is introduced.
    #[wasm_bindgen(js_name = syncArchiveState)]
    pub async fn sync_archive_state(&self) -> std::result::Result<(), JsValue> {
        self.archive_dirty.store(false, Ordering::Relaxed);
        let report = self.engine.client.resync_app_state_collection(wacore::appstate::patch_decode::WAPatchName::RegularLow)
            .await.map_err(|_| JsValue::from_str("WhatsApp archive synchronization failed"))?;
        if !report.all_synced() || self.archive_needs_sync() { return Err(JsValue::from_str("WhatsApp archive synchronization is incomplete")); }
        Ok(())
    }

    /// Use the provider's authenticated app-state mutation; no Hype-only folder changes.
    #[wasm_bindgen(js_name = archiveChat)]
    pub async fn archive_chat(&self, chat: &str, archived: bool) -> std::result::Result<(), JsValue> {
        let address = crate::normalize_recipient(chat).map_err(|_| JsValue::from_str("invalid chat"))?;
        let jid: whatsapp_rust::prelude::Jid = address.parse().map_err(|_| JsValue::from_str("invalid chat"))?;
        let actions = self.engine.client.chat_actions();
        let result = if archived { actions.archive_chat(&jid, None).await } else { actions.unarchive_chat(&jid, None).await };
        result.map_err(|_| JsValue::from_str("WhatsApp archive operation failed"))
    }

    #[wasm_bindgen(js_name = callSnapshot)]
    pub fn call_snapshot(&self) -> String {
        self.voice.snapshot()
    }

    #[wasm_bindgen(js_name = beginCall)]
    pub async fn begin_call(
        &self,
        json: &str,
        output: Function,
    ) -> std::result::Result<(), JsValue> {
        let input =
            serde_json::from_str(json).map_err(|_| JsValue::from_str("Invalid call request"))?;
        self.voice
            .begin(input, output)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = callAudio)]
    pub fn call_audio(&self, bytes: &[u8]) -> std::result::Result<(), JsValue> {
        self.voice
            .audio(bytes)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = callVideo)]
    pub fn call_video(&self, bytes: &[u8]) -> std::result::Result<(), JsValue> {
        self.voice
            .video(bytes)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = requestVideoKeyframe)]
    pub fn request_video_keyframe(&self) {
        self.voice.keyframe();
    }

    #[wasm_bindgen(js_name = muteCall)]
    pub async fn mute_call(&self, muted: bool) -> std::result::Result<(), JsValue> {
        self.voice
            .mute(muted)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = rejectCall)]
    pub async fn reject_call(&self, id: &str) -> std::result::Result<(), JsValue> {
        self.voice
            .reject(id)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = endCall)]
    pub async fn end_call(&self) {
        self.voice.end().await;
    }

    /// Install the private native relay seam before placing or accepting a call.
    #[wasm_bindgen(js_name = configureRelay)]
    pub fn configure_relay(&self, host: relay::RelayHost) {
        self.engine
            .client
            .set_relay_transport_provider(Arc::new(relay::WorkerRelayProvider(host)));
    }

    #[wasm_bindgen(js_name = contactUpdates)]
    pub fn contact_updates(&self) -> String {
        serde_json::to_string(&self.engine.contacts.drain()).unwrap_or_else(|_| "[]".into())
    }

    /// Edit a journal-owned outgoing text message; never trust client-supplied ownership.
    #[wasm_bindgen(js_name = editText)]
    pub async fn edit_text(&self, chat: &str, id: &str, sender: &str, text: &str) -> std::result::Result<(), JsValue> {
        let target = crate::content::MessageTarget { id: id.into(), sender: sender.into() };
        let stored = self.engine.journal.lookup(chat, &target).await
            .map_err(|_| JsValue::from_str("edit target unavailable"))?
            .ok_or_else(|| JsValue::from_str("edit target unavailable"))?;
        let content: crate::content::StoredInbound = serde_json::from_str(&stored.payload)
            .map_err(|_| JsValue::from_str("edit target unavailable"))?;
        if !stored.from_me || content.message.is_view_once() || crate::content::project(&content.message).kind != "text"
            || text.trim().is_empty() || text.len() > 16_384
            || wacore::time::now_millis() - stored.timestamp > 15 * 60 * 1000 {
            return Err(JsValue::from_str("message cannot be edited"));
        }
        let jid: whatsapp_rust::prelude::Jid = chat.parse().map_err(|_| JsValue::from_str("invalid chat"))?;
        self.engine.client.edit_message_raw(jid, id, waproto::whatsapp::Message::text(text), whatsapp_rust::EditOptions::default()).await
            .map_err(|_| JsValue::from_str("edit outcome uncertain"))?;
        Ok(())
    }

    /// Acknowledge only an incoming message already owned by the durable journal.
    #[wasm_bindgen(js_name = readMessage)]
    pub async fn read_message(&self, chat: &str, id: &str, sender: &str) -> std::result::Result<(), JsValue> {
        let target = crate::content::MessageTarget { id: id.into(), sender: sender.into() };
        let stored = self.engine.journal.lookup(chat, &target).await.map_err(|_| JsValue::from_str("read target unavailable"))?.ok_or_else(|| JsValue::from_str("read target unavailable"))?;
        if stored.from_me { return Err(JsValue::from_str("read target must be incoming")); }
        let jid: whatsapp_rust::prelude::Jid = chat.parse().map_err(|_| JsValue::from_str("invalid chat"))?;
        self.engine.client.mark_as_read(&jid, None, &[id]).await.map_err(|_| JsValue::from_str("read receipt failed"))
    }

    /// Revoke only this linked account's own stored messages.
    #[wasm_bindgen(js_name = deleteMessage)]
    pub async fn delete_message(&self, chat: &str, id: &str, sender: &str) -> std::result::Result<(), JsValue> {
        let target = crate::content::MessageTarget { id: id.into(), sender: sender.into() };
        let stored = self.engine.journal.lookup(chat, &target).await.map_err(|_| JsValue::from_str("delete target unavailable"))?.ok_or_else(|| JsValue::from_str("delete target unavailable"))?;
        if !stored.from_me || wacore::time::now_millis() - stored.timestamp > 48 * 60 * 60 * 1000 { return Err(JsValue::from_str("message cannot be deleted for everyone")); }
        let jid: whatsapp_rust::prelude::Jid = chat.parse().map_err(|_| JsValue::from_str("invalid chat"))?;
        self.engine.client.revoke_message_raw(jid, id, whatsapp_rust::RevokeType::Sender).await.map_err(|_| JsValue::from_str("delete outcome uncertain"))?;
        Ok(())
    }

    /// Check registration explicitly; profile metadata alone does not prove existence.
    #[wasm_bindgen(js_name = lookupPhone)]
    pub async fn lookup_phone(&self, phone: &str) -> std::result::Result<String, JsValue> {
        let normalized =
            crate::normalize_recipient(phone).map_err(|_| JsValue::from_str("invalid phone"))?;
        let jid: whatsapp_rust::prelude::Jid = normalized
            .parse()
            .map_err(|_| JsValue::from_str("invalid phone"))?;
        let results = self
            .engine
            .client
            .contacts()
            .is_on_whatsapp(std::slice::from_ref(&jid))
            .await
            .map_err(|_| JsValue::from_str("registration lookup unavailable"))?;
        let result = results
            .iter()
            .find(|result| result.jid == jid)
            .ok_or_else(|| JsValue::from_str("registration lookup incomplete"))?;
        if result.contact_error.is_some() {
            return Err(JsValue::from_str("registration lookup unavailable"));
        }
        let value = if result.is_registered {
            serde_json::json!({ "status": "registered", "address": normalized })
        } else {
            serde_json::json!({ "status": "not_found" })
        };
        Ok(value.to_string())
    }

    /// Resolve identity metadata; photo URLs remain on the private host boundary.
    pub async fn profile(&self, jid: &str) -> std::result::Result<String, JsValue> {
        let profile = crate::profiles::lookup(&self.engine.client, jid)
            .await
            .map_err(|_| JsValue::from_str("profile lookup failed"))?;
        serde_json::to_string(&profile).map_err(|_| JsValue::from_str("profile encoding failed"))
    }

    /// Stage encrypted media; this descriptor is private to the account journal.
    #[wasm_bindgen(js_name = prepareMedia)]
    pub async fn prepare_media(
        &self,
        json: &str,
        bytes: Vec<u8>,
    ) -> std::result::Result<String, JsValue> {
        let input =
            serde_json::from_str(json).map_err(|_| JsValue::from_str("invalid media options"))?;
        let message = crate::media::prepare(&self.engine.client, input, bytes)
            .await
            .map_err(|_| JsValue::from_str("media upload failed"))?;
        serde_json::to_string(&message).map_err(|_| JsValue::from_str("media encoding failed"))
    }

    /// Resolve the target privately; downloaded plaintext is returned only via authenticated RPC.
    #[wasm_bindgen(js_name = downloadMedia)]
    pub async fn download_media(
        &self,
        chat: &str,
        json: &str,
    ) -> std::result::Result<Vec<u8>, JsValue> {
        let operation = async {
            let chat = crate::normalize_recipient(chat)?;
            let target: crate::content::MessageTarget = serde_json::from_str(json)?;
            target.validate()?;
            let original = self
                .engine
                .journal
                .lookup(&chat, &target)
                .await?
                .ok_or_else(|| anyhow!("message not found"))?;
            let stored: crate::content::StoredInbound = serde_json::from_str(&original.payload)?;
            crate::media::download(&self.engine.client, &stored.message).await
        };
        operation.await.map_err(|_| {
            JsValue::from_str("media unavailable, expired, view-once, or larger than 8 MiB")
        })
    }

    pub fn status(&self) -> std::result::Result<String, JsValue> {
        let mut status = self.engine.status.snapshot();
        if let Some(jid) = self.engine.client.pn() {
            let phone = format!("+{}", jid.user);
            let name = self.engine.client.push_name();
            status.identity = Some(crate::SessionIdentity {
                id: jid.to_non_ad().to_string(),
                name: if name.is_empty() { phone.clone() } else { name },
                username: None,
                phone: Some(phone),
            });
        }
        serde_json::to_string(&status).map_err(|_| JsValue::from_str("status serialization failed"))
    }
    pub async fn send(&self, json: &str) -> std::result::Result<String, JsValue> {
        let request: TextRequest =
            serde_json::from_str(json).map_err(|_| JsValue::from_str("invalid send request"))?;
        let result = self
            .engine
            .send(request)
            .await
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_json::to_string(&result)
            .map_err(|_| JsValue::from_str("send result serialization failed"))
    }
    pub async fn stop(&self) -> std::result::Result<(), JsValue> {
        self.voice.end().await;
        let report = self
            .engine
            .shutdown()
            .await
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        if report.shutdown.device.is_err()
            || report.shutdown.message_secrets.failed_batches > 0
            || [
                report.shutdown.inbound,
                report.shutdown.outbound,
                report.shutdown.signal_settle,
            ]
            .iter()
            .any(|d| *d != DrainOutcome::Completed)
        {
            return Err(JsValue::from_str(
                "session shutdown could not confirm all persistence",
            ));
        }
        Ok(())
    }
}
