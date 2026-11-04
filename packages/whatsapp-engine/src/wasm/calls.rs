//! Ephemeral voice state. Explicit user actions are the only source of call signaling.
use anyhow::{Result, anyhow, ensure};
use futures::{FutureExt, StreamExt};
use js_sys::{Function, Uint8Array};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    rc::Rc,
    sync::{Arc, Mutex},
};
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::spawn_local;
use whatsapp_rust::{
    prelude::*,
    types::call::{CallAction, IncomingCall},
    voip::{
        CallEvent, CallHandle, CallTermination, KeyframeUrgency, TimedVideoFrame, VideoFrame,
        VideoSource, VideoState,
    },
};

#[derive(Clone)]
struct Offer {
    received: i64,
    call: IncomingCall,
}

/// The SDK synchronously reports offers; no JS handles enter its Send + Sync event handler.
#[derive(Clone, Default)]
pub struct Offers(Arc<Mutex<BTreeMap<String, Offer>>>);

impl Offers {
    fn prune(&self) {
        self.0
            .lock()
            .unwrap()
            .retain(|_, offer| wacore::time::now_millis() - offer.received < 90_000);
    }
    fn get(&self, id: &str) -> Result<IncomingCall> {
        self.prune();
        self.0
            .lock()
            .unwrap()
            .get(id)
            .map(|offer| offer.call.clone())
            .ok_or_else(|| anyhow!("Incoming call is no longer available"))
    }
    fn remove(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
}

impl EventHandler for Offers {
    fn handle_event(&self, event: Arc<Event>) {
        let Event::IncomingCall(incoming) = &*event else {
            return;
        };
        self.prune();
        let mut offers = self.0.lock().unwrap();
        let id = incoming.action.call_id().to_owned();
        // A matching ID alone is not authority to retire another caller's offer.
        if offers.get(&id).is_some_and(|offer| {
            offer.call.action.call_creator().to_non_ad()
                != incoming.action.call_creator().to_non_ad()
        }) {
            return;
        }
        match &incoming.action {
            CallAction::Offer {
                group_jid: None, ..
            } if !incoming.offline && incoming.group.is_none() => {
                if offers.len() < 4 || offers.contains_key(&id) {
                    offers.entry(id).or_insert_with(|| Offer {
                        received: wacore::time::now_millis(),
                        call: (**incoming).clone(),
                    });
                }
            }
            CallAction::Terminate { .. } => {
                offers.remove(&id);
            }
            CallAction::Reject { reason, .. }
                if !matches!(reason.as_deref(), Some("busy" | "enc")) =>
            {
                offers.remove(&id);
            }
            _ => {}
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum BeginCall {
    Outgoing {
        #[serde(rename = "requestId")]
        request_id: String,
        to: String,
        #[serde(default)]
        video: bool,
    },
    Answer {
        #[serde(rename = "requestId")]
        request_id: String,
        id: String,
        #[serde(default)]
        video: bool,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CallView {
    request_id: String,
    id: Option<String>,
    peer: String,
    phase: &'static str,
    muted: bool,
    video: bool,
    started_at: i64,
    connected_at: Option<i64>,
    error: Option<&'static str>,
}

struct Active {
    generation: u64,
    view: CallView,
    handle: Option<CallHandle>,
    input: async_channel::Sender<Vec<i16>>,
    discard: async_channel::Receiver<Vec<i16>>,
    cancelled: bool,
    video_input: Option<async_channel::Sender<TimedVideoFrame>>,
}

#[derive(Default)]
struct State {
    active: Option<Active>,
    last: Option<CallView>,
    generation: u64,
}

impl State {
    /// Completion belongs to one invocation, even if a caller reuses a request ID.
    fn finish(&mut self, generation: u64, error: Option<&'static str>) {
        if !self
            .active
            .as_ref()
            .is_some_and(|active| active.generation == generation)
        {
            return;
        }
        let mut active = self.active.take().unwrap();
        active.input.close();
        if let Some(input) = &active.video_input {
            input.close();
        }
        active.view.phase = "ended";
        active.view.error = error;
        self.last = Some(active.view);
    }
}

/// Capture timestamps survive dropped browser frames; the SDK owns RTP packetization.
struct BrowserVideoSource {
    frames: async_channel::Receiver<TimedVideoFrame>,
    unused: async_channel::Receiver<Vec<u8>>,
}
impl VideoSource for BrowserVideoSource {
    fn frames(&self) -> async_channel::Receiver<Vec<u8>> {
        self.unused.clone()
    }
    fn timed_frames(&self) -> Option<async_channel::Receiver<TimedVideoFrame>> {
        Some(self.frames.clone())
    }
}

pub struct VoiceController {
    client: Arc<Client>,
    pub offers: Offers,
    state: Rc<RefCell<State>>,
}

impl VoiceController {
    pub fn new(client: Arc<Client>, offers: Offers) -> Self {
        Self {
            client,
            offers,
            state: Rc::new(RefCell::new(State::default())),
        }
    }

    /// A safe UI projection; never serialize offer payloads, relay coordinates or call keys.
    pub fn snapshot(&self) -> String {
        self.offers.prune();
        let pending: Vec<_> = self
            .offers
            .0
            .lock()
            .unwrap()
            .iter()
            .map(|(id, offer)| {
                serde_json::json!({
                    "id": id, "peer": offer.call.from.to_non_ad_string(), "name": offer.call.notify,
                    "receivedAt": offer.received,
                    "video": matches!(offer.call.action, CallAction::Offer { is_video: true, .. }),
                })
            })
            .collect();
        let mut state = self.state.borrow_mut();
        if let Some(active) = &mut state.active {
            if let Some(handle) = &active.handle {
                active.view.muted = handle.is_muted();
                if handle.media_connected() && !active.cancelled {
                    active.view.phase = "active";
                    active
                        .view
                        .connected_at
                        .get_or_insert_with(wacore::time::now_millis);
                }
            }
        }
        serde_json::json!({ "incoming": pending, "current": state.active.as_ref().map(|a| &a.view).or(state.last.as_ref()) }).to_string()
    }

    pub async fn begin(&self, input: BeginCall, output: Function) -> Result<()> {
        ensure!(
            self.state.borrow().active.is_none(),
            "A voice call is already in progress"
        );
        let (request_id, peer, incoming, video) = match input {
            BeginCall::Outgoing {
                request_id,
                to,
                video,
            } => {
                let peer = crate::normalize_recipient(&to)?;
                ensure!(
                    !peer.ends_with("@g.us"),
                    "Choose one contact for a voice call"
                );
                (request_id, peer, None, video)
            }
            BeginCall::Answer {
                request_id,
                id,
                video,
            } => {
                let incoming = self.offers.get(&id)?;
                ensure!(
                    video == matches!(incoming.action, CallAction::Offer { is_video: true, .. }),
                    "Answer mode must match the incoming call"
                );
                (
                    request_id,
                    incoming.from.to_non_ad_string(),
                    Some(incoming),
                    video,
                )
            }
        };
        ensure!(
            !request_id.is_empty() && request_id.len() <= 128,
            "Invalid call request ID"
        );
        let peer_jid: Jid = peer.parse()?;
        let (mic_tx, mic_rx) = async_channel::bounded(4);
        let (speaker_tx, speaker_rx) = async_channel::bounded(4);
        let (video_tx, video_rx) = async_channel::bounded::<TimedVideoFrame>(2);
        let (screen_tx, screen_rx) = async_channel::bounded::<VideoFrame>(2);
        let (_unused_tx, unused_rx) = async_channel::bounded(1);
        let source = BrowserVideoSource {
            frames: video_rx,
            unused: unused_rx,
        };
        let generation = {
            let mut state = self.state.borrow_mut();
            state.generation = state
                .generation
                .checked_add(1)
                .ok_or_else(|| anyhow!("Call session exhausted"))?;
            state.generation
        };
        self.state.borrow_mut().active = Some(Active {
            generation,
            view: CallView {
                request_id: request_id.clone(),
                id: None,
                peer,
                phase: "connecting",
                muted: false,
                video,
                started_at: wacore::time::now_millis(),
                connected_at: None,
                error: None,
            },
            handle: None,
            input: mic_tx,
            discard: mic_rx.clone(),
            cancelled: false,
            video_input: video.then_some(video_tx),
        });
        let voip = self.client.voip();
        let result = if let Some(incoming) = &incoming {
            let builder = voip.accept(incoming).audio(mic_rx, speaker_tx);
            if video {
                builder.video(source, screen_tx).start().await
            } else {
                builder.start().await
            }
        } else {
            let builder = voip.call(&peer_jid).audio(mic_rx, speaker_tx);
            if video {
                builder.video(source, screen_tx).start().await
            } else {
                builder.start().await
            }
        };
        let handle = match result {
            Ok(handle) => handle,
            Err(_) => {
                self.state
                    .borrow_mut()
                    .finish(generation, Some("Voice call setup failed"));
                return Err(anyhow!("Voice call setup failed"));
            }
        };
        if let Some(incoming) = incoming {
            self.offers.remove(incoming.action.call_id());
        }
        let cancelled = {
            let mut state = self.state.borrow_mut();
            if let Some(active) = state
                .active
                .as_mut()
                .filter(|active| active.generation == generation)
            {
                active.view.id = Some(handle.call_id().into());
                active.view.phase = if handle.media_connected() {
                    "active"
                } else {
                    "ringing"
                };
                active.handle = Some(handle.clone());
                active.cancelled
            } else {
                true
            }
        };
        if cancelled {
            let outcome = handle.terminate().await;
            self.state
                .borrow_mut()
                .finish(generation, termination_error(outcome));
            return Ok(());
        }
        let Some(mut events) = handle.take_events() else {
            self.end().await;
            return Err(anyhow!("Voice call events unavailable"));
        };
        let weak = Rc::downgrade(&self.state);
        spawn_local(async move {
            let ended = handle.wait_ended().fuse();
            futures::pin_mut!(ended);
            let failure = loop {
                futures::select_biased! {
                    _ = ended => break None,
                    frame = speaker_rx.recv().fuse() => {
                        let Ok(frame) = frame else { break None; };
                        let mut packet = Vec::with_capacity(1 + frame.len() * 2);
                        packet.push(0); // 16 kHz mono signed little-endian PCM.
                        for sample in frame { packet.extend_from_slice(&sample.to_le_bytes()); }
                        if emit(&output, &packet).is_err() { break Some("Audio connection closed"); }
                    },
                    frame = async { if video { screen_rx.recv().await.ok() } else { futures::future::pending().await } }.fuse() => {
                        let Some(frame) = frame else { break None; };
                        if frame.data.len() > 512 * 1024 { handle.request_peer_keyframe(KeyframeUrgency::Immediate); continue; }
                        let mut packet = Vec::with_capacity(frame.data.len() + 7);
                        packet.extend_from_slice(&[2, u8::from(frame.keyframe), frame.orientation & 3]);
                        packet.extend_from_slice(&frame.timestamp.to_be_bytes());
                        packet.extend_from_slice(&frame.data);
                        if emit(&output, &packet).is_err() { break Some("Video connection closed"); }
                    },
                    event = events.next().fuse() => match event {
                        Some(CallEvent::PeerVideoStateChanged { state, .. }) => {
                            let enabled = match state { VideoState::Enabled => Some(true), VideoState::Disabled | VideoState::Paused | VideoState::Stopped => Some(false), _ => None };
                            if let Some(enabled) = enabled { if emit(&output, &[4, u8::from(enabled)]).is_err() { break Some("Video connection closed"); } }
                        }
                        Some(CallEvent::VideoKeyframeNeeded) => { if emit(&output, &[3]).is_err() { break Some("Video connection closed"); } }
                        Some(CallEvent::ForeignAudio(packet)) => {
                            let mut framed = Vec::with_capacity(packet.len() + 1);
                            framed.push(1); // Standard Opus escape; browser uses its Opus decoder.
                            framed.extend_from_slice(&packet);
                            if emit(&output, &framed).is_err() { break Some("Audio connection closed"); }
                        }
                        Some(CallEvent::MediaSetupFailed(_)) | Some(CallEvent::RelayAllocateFailed(_)) |
                        Some(CallEvent::RelayAllocateTimedOut) | Some(CallEvent::RelayReconnectTimedOut) |
                        Some(CallEvent::AudioFormatMismatch { .. }) => break Some("Voice media connection failed"),
                        Some(CallEvent::Closed(_)) | None => break None,
                        _ => {},
                    },
                }
            };
            // A broken audio pipe must terminate the remote call, not leave it ringing.
            let outcome = handle.terminate().await;
            if let Some(state) = weak.upgrade() {
                state
                    .borrow_mut()
                    .finish(generation, failure.or(termination_error(outcome)));
            }
        });
        Ok(())
    }

    pub fn audio(&self, bytes: &[u8]) -> Result<()> {
        ensure!(bytes.len() == 1920, "Voice input must be 960 PCM samples");
        let state = self.state.borrow();
        let active = state
            .active
            .as_ref()
            .ok_or_else(|| anyhow!("No active call"))?;
        if active.cancelled {
            return Ok(());
        }
        let samples = bytes
            .chunks_exact(2)
            .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        if active.input.is_full() {
            let _ = active.discard.try_recv();
        }
        let _ = active.input.try_send(samples);
        Ok(())
    }

    /// Queue one bounded, complete Annex-B access unit with its capture clock.
    pub fn video(&self, packet: &[u8]) -> Result<()> {
        let frame = decode_video_frame(packet)?;
        let state = self.state.borrow();
        let active = state
            .active
            .as_ref()
            .ok_or_else(|| anyhow!("No active call"))?;
        if active.cancelled {
            return Ok(());
        }
        let input = active
            .video_input
            .as_ref()
            .ok_or_else(|| anyhow!("This is an audio call"))?;
        ensure!(
            input.try_send(frame).is_ok(),
            "Video queue full; send a keyframe"
        );
        Ok(())
    }

    pub fn keyframe(&self) {
        if let Some(handle) = self
            .state
            .borrow()
            .active
            .as_ref()
            .and_then(|active| active.handle.as_ref())
        {
            handle.request_peer_keyframe(KeyframeUrgency::Immediate);
        }
    }

    pub async fn mute(&self, muted: bool) -> Result<()> {
        let handle = self
            .state
            .borrow()
            .active
            .as_ref()
            .and_then(|a| a.handle.clone())
            .ok_or_else(|| anyhow!("Call is still connecting"))?;
        handle
            .set_muted(muted)
            .await
            .map_err(|_| anyhow!("Could not confirm microphone state"))
    }

    pub async fn reject(&self, id: &str) -> Result<()> {
        let incoming = self.offers.get(id)?;
        self.client
            .voip()
            .reject(&incoming)
            .await
            .map_err(|_| anyhow!("Could not decline call"))?;
        self.offers.remove(id);
        Ok(())
    }

    pub async fn end(&self) {
        let (generation, handle) = {
            let mut state = self.state.borrow_mut();
            let Some(active) = state.active.as_mut() else {
                return;
            };
            active.cancelled = true;
            active.view.phase = "ending";
            active.input.close();
            if let Some(input) = &active.video_input {
                input.close();
            }
            (active.generation, active.handle.clone())
        };
        if let Some(handle) = handle {
            let outcome = handle.terminate().await;
            self.state
                .borrow_mut()
                .finish(generation, termination_error(outcome));
        }
    }
}

/// Validate the browser framing before allocating an encoded media unit.
fn decode_video_frame(packet: &[u8]) -> Result<TimedVideoFrame> {
    ensure!(
        packet.len() > 7
            && packet.len() <= 512 * 1024 + 7
            && packet[0] == 2
            && packet[1] <= 1
            && packet[2] == 0,
        "Invalid video frame"
    );
    ensure!(
        packet[7..].starts_with(&[0, 0, 0, 1]) || packet[7..].starts_with(&[0, 0, 1]),
        "Video must be Annex-B"
    );
    Ok(TimedVideoFrame::builder()
        .data(packet[7..].to_vec())
        .timestamp(u32::from_be_bytes(packet[3..7].try_into().unwrap()))
        .build())
}

fn termination_error(outcome: CallTermination) -> Option<&'static str> {
    if matches!(
        outcome,
        CallTermination::PeerNotified | CallTermination::AlreadyEnded
    ) {
        None
    } else {
        Some("Ended locally; remote hang-up was not confirmed")
    }
}

fn emit(output: &Function, packet: &[u8]) -> Result<()> {
    ensure!(
        packet.len() <= 512 * 1024 + 7,
        "Call output exceeds frame bound"
    );
    output
        .call1(&JsValue::NULL, &Uint8Array::from(packet))
        .map_err(|_| anyhow!("Audio sink closed"))?;
    Ok(())
}

/// Regression checks against the real state transitions, with no account or signaling.
#[cfg(feature = "qualification")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = qualifyCallLifecycle)]
pub fn qualify_call_lifecycle() -> std::result::Result<(), JsValue> {
    fn check() -> Result<()> {
        let frame = decode_video_frame(&[2, 1, 0, 0, 1, 95, 144, 0, 0, 0, 1, 0x65])?;
        ensure!(
            frame.timestamp == 90_000 && frame.data == [0, 0, 0, 1, 0x65],
            "Video capture clock or Annex-B payload changed"
        );
        ensure!(
            decode_video_frame(&[2, 1, 0, 0, 0, 0, 0, 9]).is_err(),
            "Invalid Annex-B accepted"
        );
        ensure!(
            decode_video_frame(&vec![2; 512 * 1024 + 8]).is_err(),
            "Oversized video accepted"
        );
        ensure!(
            matches!(
                serde_json::from_str::<BeginCall>(
                    r#"{"kind":"outgoing","requestId":"video","to":"+15555550100","video":true}"#
                )?,
                BeginCall::Outgoing { video: true, .. }
            ),
            "Video mode not parsed"
        );
        let make_active = |generation| {
            let (input, discard) = async_channel::bounded(4);
            Active {
                generation,
                handle: None,
                input,
                discard,
                cancelled: false,
                video_input: None,
                view: CallView {
                    request_id: "same-request-id".into(),
                    id: None,
                    peer: "15555550100@s.whatsapp.net".into(),
                    phase: "connecting",
                    muted: false,
                    video: false,
                    started_at: 0,
                    connected_at: None,
                    error: None,
                },
            }
        };
        let mut state = State {
            active: Some(make_active(1)),
            ..Default::default()
        };
        let old_input = state.active.as_ref().unwrap().input.clone();
        state.finish(1, None);
        ensure!(
            old_input.is_closed() && state.active.is_none(),
            "ended microphone queue was not closed"
        );
        state.active = Some(make_active(2));
        state.finish(1, Some("late old hang-up"));
        ensure!(
            state
                .active
                .as_ref()
                .is_some_and(|active| active.generation == 2 && !active.input.is_closed()),
            "old cleanup removed a newer call"
        );
        // Cancellation before a handle exists must reserve the slot until setup settles.
        let pending = state.active.as_mut().unwrap();
        pending.cancelled = true;
        pending.input.close();
        ensure!(
            state.active.is_some(),
            "pending setup released its slot too early"
        );
        state.finish(
            2,
            termination_error(CallTermination::PartlyNotified {
                notified: 0,
                unconfirmed: 1,
            }),
        );
        ensure!(
            state.last.as_ref().unwrap().error.is_some(),
            "unconfirmed hang-up was presented as confirmed"
        );

        let offers = Offers::default();
        let creator: Jid = "15555550100@s.whatsapp.net".parse()?;
        let event = |action| {
            Arc::new(Event::IncomingCall(Box::new(
                IncomingCall::builder()
                    .from(creator.clone())
                    .stanza_id("synthetic".into())
                    .offline(false)
                    .action(action)
                    .build(),
            )))
        };
        offers.handle_event(event(CallAction::Offer {
            call_id: "synthetic-offer".into(),
            call_creator: creator.clone(),
            caller_pn: None,
            caller_country_code: None,
            device_class: None,
            joinable: false,
            is_video: false,
            audio: vec![],
            group_jid: None,
        }));
        ensure!(
            offers.get("synthetic-offer").is_ok(),
            "live offer not retained"
        );
        offers.handle_event(event(CallAction::Terminate {
            call_id: "synthetic-offer".into(),
            call_creator: "15555550101@s.whatsapp.net".parse()?,
            reason: None,
            duration: None,
            audio_duration: None,
        }));
        ensure!(
            offers.get("synthetic-offer").is_ok(),
            "another creator removed an offer"
        );
        offers.handle_event(event(CallAction::Reject {
            call_id: "synthetic-offer".into(),
            call_creator: creator.clone(),
            reason: Some("busy".into()),
        }));
        ensure!(
            offers.get("synthetic-offer").is_ok(),
            "busy companion removed an offer"
        );
        offers.handle_event(event(CallAction::Terminate {
            call_id: "synthetic-offer".into(),
            call_creator: creator.clone(),
            reason: Some("accepted_elsewhere".into()),
            duration: None,
            audio_duration: None,
        }));
        ensure!(
            offers.get("synthetic-offer").is_err(),
            "answered elsewhere remained available"
        );
        Ok(())
    }
    check().map_err(|error| {
        JsValue::from_str(&format!("call lifecycle qualification failed: {error}"))
    })
}
