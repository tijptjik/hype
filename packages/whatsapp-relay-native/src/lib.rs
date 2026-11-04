//! Authenticated WebSocket to the SDK's native UDP/DTLS/SCTP relay transport.
//! Each socket owns one relay. No disk, account state, call signaling, or plaintext audio.
pub mod probe;
use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Result;
use axum::{
    Router,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use subtle::ConstantTimeEq;
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::{Instant, timeout},
};
use whatsapp_rust::{
    TokioRuntime,
    voip::{
        RelayTransport, RelayTransportEvent, RelayTransportFactory,
        transport::RelayMediaChannelFactory,
    },
};

const MAX_PACKET: usize = 65_536;
const IO_TIMEOUT: Duration = Duration::from_secs(5);
const IDLE_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_LIFETIME: Duration = Duration::from_secs(2 * 60 * 60);

pub type RelayConnection = (
    Arc<dyn RelayTransport>,
    async_channel::Receiver<RelayTransportEvent>,
);

/// Injectable only in-process; production always uses the pinned SDK transport.
#[async_trait::async_trait]
pub trait RelayDialer: Send + Sync {
    async fn connect(&self, endpoint: SocketAddr) -> Result<RelayConnection>;
}

pub struct NativeDialer;
#[async_trait::async_trait]
impl RelayDialer for NativeDialer {
    async fn connect(&self, endpoint: SocketAddr) -> Result<RelayConnection> {
        RelayMediaChannelFactory::new(endpoint, Arc::new(TokioRuntime))
            .connect()
            .await
    }
}

#[derive(Clone)]
pub struct RelayState {
    authorization: Arc<[u8]>,
    dialer: Arc<dyn RelayDialer>,
    slots: Arc<Semaphore>,
}

impl RelayState {
    pub fn new(token: String, dialer: Arc<dyn RelayDialer>) -> Result<Self> {
        anyhow::ensure!(
            token.len() >= 32
                && token.len() <= 128
                && token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "relay token must be 32 to 128 URL-safe characters"
        );
        Ok(Self {
            authorization: format!("Bearer {token}").into_bytes().into(),
            dialer,
            // One container belongs to one account. Leave space for a relay handover.
            slots: Arc::new(Semaphore::new(2)),
        })
    }
}

pub fn router(state: RelayState) -> Router {
    Router::new()
        .route("/health", get(|| async { "ready" }))
        .route("/relay", get(upgrade))
        .with_state(state)
}

async fn upgrade(
    State(state): State<RelayState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let provided = headers
        .get("authorization")
        .map(|h| h.as_bytes())
        .unwrap_or_default();
    if !bool::from(provided.ct_eq(&state.authorization)) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(slot) = state.slots.clone().try_acquire_owned() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    ws.max_message_size(MAX_PACKET)
        .max_frame_size(MAX_PACKET)
        .write_buffer_size(0)
        .max_write_buffer_size(2 * MAX_PACKET)
        .on_upgrade(move |socket| session(socket, state, slot))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenRelay {
    endpoint: SocketAddr,
}

/// Only literal globally routable addresses from the trusted SDK are admissible.
/// Deny local, metadata, documentation, multicast and transition address space.
pub fn allowed_endpoint(endpoint: SocketAddr) -> bool {
    if endpoint.port() == 0 {
        return false;
    }
    let ip = endpoint.ip();
    let deny = if ip.is_ipv4() {
        &[
            "0.0.0.0/8",
            "10.0.0.0/8",
            "100.64.0.0/10",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.0.0.0/24",
            "192.0.2.0/24",
            "192.88.99.0/24",
            "192.168.0.0/16",
            "198.18.0.0/15",
            "198.51.100.0/24",
            "203.0.113.0/24",
            "224.0.0.0/4",
            "240.0.0.0/4",
        ][..]
    } else {
        if !"2000::/3".parse::<ipnet::IpNet>().unwrap().contains(&ip) {
            return false;
        }
        &["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"][..]
    };
    !deny
        .iter()
        .any(|network| network.parse::<ipnet::IpNet>().unwrap().contains(&ip))
}

async fn session(mut socket: WebSocket, state: RelayState, _slot: OwnedSemaphorePermit) {
    // No endpoint in URLs or logs; authentication precedes parsing and dialing.
    let Ok(Some(Ok(Message::Text(open)))) = timeout(IO_TIMEOUT, socket.recv()).await else {
        return;
    };
    if open.len() > 256 {
        return;
    }
    let Ok(open) = serde_json::from_str::<OpenRelay>(&open) else {
        return;
    };
    if !allowed_endpoint(open.endpoint) {
        return;
    }
    // Closing a browser/Worker while dialing cancels the native handshake too.
    let connecting = timeout(Duration::from_secs(30), state.dialer.connect(open.endpoint));
    tokio::pin!(connecting);
    let mut waiting_budget = PacketBudget::new();
    let connection = loop {
        tokio::select! {
            result = &mut connecting => break result,
            frame = socket.recv() => match frame {
                Some(Ok(Message::Text(text))) if text == "ping" && waiting_budget.accept(4) => {
                    if !matches!(timeout(IO_TIMEOUT, socket.send(Message::Text("pong".into()))).await, Ok(Ok(()))) { return; }
                }
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) if waiting_budget.accept(1) => {},
                _ => return,
            },
        }
    };
    let Ok(Ok((relay, events))) = connection else {
        let _ = timeout(
            IO_TIMEOUT,
            socket.send(Message::Text("{\"state\":\"failed\"}".into())),
        )
        .await;
        return;
    };
    let _ = timeout(MAX_LIFETIME, pipe(&mut socket, &relay, events)).await;
    // Explicit cleanup even on timeout or failed WebSocket writes.
    let _ = timeout(IO_TIMEOUT, relay.disconnect()).await;
    let _ = timeout(IO_TIMEOUT, socket.close()).await;
}

struct PacketBudget {
    start: Instant,
    frames: usize,
    bytes: usize,
}
impl PacketBudget {
    fn new() -> Self {
        Self {
            start: Instant::now(),
            frames: 0,
            bytes: 0,
        }
    }
    fn accept(&mut self, size: usize) -> bool {
        if self.start.elapsed() >= Duration::from_secs(1) {
            *self = Self::new();
        }
        self.frames += 1;
        self.bytes += size;
        // Video keyframes fragment into many RTP packets; retain a bounded per-second budget.
        size > 0 && size <= MAX_PACKET && self.frames <= 2000 && self.bytes <= 4 * 1024 * 1024
    }
}

async fn pipe(
    socket: &mut WebSocket,
    relay: &Arc<dyn RelayTransport>,
    events: async_channel::Receiver<RelayTransportEvent>,
) -> Result<()> {
    let mut budget = PacketBudget::new();
    let mut outbound = PacketBudget::new();
    let mut last_client = Instant::now();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(5));
    loop {
        tokio::select! {
            frame = socket.next() => match frame {
                Some(Ok(Message::Binary(packet))) if budget.accept(packet.len()) => {
                    last_client = Instant::now();
                    timeout(IO_TIMEOUT, relay.send(packet)).await??;
                }
                Some(Ok(Message::Text(text))) if text == "ping" && budget.accept(4) => {
                    last_client = Instant::now();
                    timeout(IO_TIMEOUT, socket.send(Message::Text("pong".into()))).await??;
                }
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) if budget.accept(1) => { last_client = Instant::now(); }
                _ => return Ok(()),
            },
            event = events.recv() => match event {
                Ok(RelayTransportEvent::Connected) => {
                    timeout(IO_TIMEOUT, socket.send(Message::Text("{\"state\":\"connected\"}".into()))).await??;
                }
                Ok(RelayTransportEvent::PacketReceived(packet)) => {
                    if !outbound.accept(packet.len()) { continue; }
                    timeout(IO_TIMEOUT, socket.send(Message::Binary(packet))).await??;
                }
                Ok(RelayTransportEvent::InboundDropped(count)) => {
                    timeout(IO_TIMEOUT, socket.send(Message::Text(format!("{{\"dropped\":{count}}}").into()))).await??;
                }
                Ok(RelayTransportEvent::Disconnected(_)) | Err(_) => return Ok(()),
                _ => {},
            },
            _ = heartbeat.tick() => {
                if last_client.elapsed() >= IDLE_TIMEOUT { return Ok(()); }
            },
        }
    }
}


#[cfg(test)]
mod video_budget_tests {
    use super::*;

    #[test]
    fn admits_video_keyframe_bursts_but_bounds_packets_and_bytes() {
        let mut budget = PacketBudget::new();
        for _ in 0..600 { assert!(budget.accept(1200)); }
        for _ in 600..2000 { assert!(budget.accept(1200)); }
        assert!(!budget.accept(1200));
        let mut budget = PacketBudget::new();
        for _ in 0..64 { assert!(budget.accept(MAX_PACKET)); }
        assert!(!budget.accept(1));
        assert!(!PacketBudget::new().accept(MAX_PACKET + 1));
    }
}
