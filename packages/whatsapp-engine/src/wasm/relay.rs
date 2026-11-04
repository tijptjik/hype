//! Native media relay supplied by the owning Durable Object, never a global URL/token.
use anyhow::{Result, anyhow};
use bytes::Bytes;
use js_sys::{Function, Promise, Uint8Array};
use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};
use wacore::voip_control::transport::RelayDisconnectReason;
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;
use whatsapp_rust::voip::{
    RelayEndpointParams, RelayTransport, RelayTransportEvent, RelayTransportFactory,
    RelayTransportProvider,
};

#[wasm_bindgen]
extern "C" {
    #[derive(Clone)]
    pub type RelayHost;
    #[wasm_bindgen(method, catch)]
    fn dial(
        this: &RelayHost,
        endpoint: &str,
        callback: &Function,
    ) -> std::result::Result<RelaySocket, JsValue>;

    type RelaySocket;
    #[wasm_bindgen(method, getter)]
    fn ready(this: &RelaySocket) -> Promise;
    #[wasm_bindgen(method, catch)]
    fn send(this: &RelaySocket, data: &[u8]) -> std::result::Result<(), JsValue>;
    #[wasm_bindgen(method)]
    fn close(this: &RelaySocket);
}

pub struct WorkerRelayProvider(pub RelayHost);
struct WorkerRelayFactory {
    host: RelayHost,
    endpoint: SocketAddr,
}
struct WorkerRelay {
    host: RelayHost,
    socket: RelaySocket,
    _callback: Closure<dyn FnMut(JsValue)>,
}

impl Drop for WorkerRelay {
    fn drop(&mut self) {
        self.socket.close();
    }
}

#[async_trait::async_trait(?Send)]
impl RelayTransportProvider for WorkerRelayProvider {
    async fn factory(&self, relay: &RelayEndpointParams) -> Result<Arc<dyn RelayTransportFactory>> {
        // Native DTLS/SCTP needs only the endpoint. ICE credentials remain in WASM.
        Ok(Arc::new(WorkerRelayFactory {
            host: self.0.clone(),
            endpoint: relay.addr,
        }))
    }
}

#[async_trait::async_trait(?Send)]
impl RelayTransportFactory for WorkerRelayFactory {
    async fn connect(
        &self,
    ) -> Result<(
        Arc<dyn RelayTransport>,
        async_channel::Receiver<RelayTransportEvent>,
    )> {
        let (tx, rx) = async_channel::bounded(64);
        let dropped = Arc::new(AtomicU32::new(0));
        let callback = Closure::<dyn FnMut(JsValue)>::new(move |data: JsValue| {
            if data.is_null() || data.is_undefined() {
                tx.close();
                return;
            }
            if let Some(count) = data.as_f64() {
                dropped.fetch_add(count as u32, Ordering::Relaxed);
                return;
            }
            let pending = dropped.swap(0, Ordering::Relaxed);
            if pending > 0
                && tx
                    .try_send(RelayTransportEvent::InboundDropped(pending))
                    .is_err()
            {
                dropped.fetch_add(pending, Ordering::Relaxed);
            }
            let event = if data.is_instance_of::<js_sys::ArrayBuffer>() {
                let bytes = Uint8Array::new(&data);
                if bytes.length() > 65_536 {
                    tx.close();
                    return;
                }
                RelayTransportEvent::PacketReceived(Bytes::from(bytes.to_vec()))
            } else if data.as_string().as_deref() == Some("connected") {
                RelayTransportEvent::Connected
            } else {
                RelayTransportEvent::Disconnected(RelayDisconnectReason::Unknown)
            };
            if tx.try_send(event).is_err() {
                dropped.fetch_add(1, Ordering::Relaxed);
            }
        });
        let channel = WorkerRelay {
            host: self.host.clone(),
            socket: self
                .host
                .dial(
                    &self.endpoint.to_string(),
                    callback.as_ref().unchecked_ref(),
                )
                .map_err(|_| anyhow!("private relay dial failed"))?,
            _callback: callback,
        };
        // If this future is cancelled during setup, Drop detaches the JS callback
        // before wasm-bindgen frees its closure, including a still-pending fetch.
        JsFuture::from(channel.socket.ready())
            .await
            .map_err(|_| anyhow!("private relay unavailable"))?;
        Ok((Arc::new(channel), rx))
    }
}

#[async_trait::async_trait(?Send)]
impl RelayTransport for WorkerRelay {
    async fn send(&self, data: Bytes) -> Result<()> {
        self.socket
            .send(&data)
            .map_err(|_| anyhow!("private relay write failed"))
    }
    async fn disconnect(&self) {
        self.socket.close();
    }
    async fn reconnect(
        &self,
        endpoint: SocketAddr,
    ) -> Result<(
        Arc<dyn RelayTransport>,
        async_channel::Receiver<RelayTransportEvent>,
    )> {
        WorkerRelayFactory {
            host: self.host.clone(),
            endpoint,
        }
        .connect()
        .await
    }
}

/// Exercise the actual WASM/host packet boundary without any WhatsApp signaling.
#[cfg(feature = "qualification")]
#[wasm_bindgen(js_name = qualifyRelay)]
pub async fn qualify_relay(host: RelayHost) -> std::result::Result<(), JsValue> {
    let operation = async {
        let factory = WorkerRelayFactory {
            host,
            endpoint: "157.240.1.1:3478".parse().unwrap(),
        };
        let (transport, events) = factory.connect().await?;
        transport
            .send(Bytes::from_static(b"synthetic relay qualification"))
            .await?;
        loop {
            match events.recv().await? {
                RelayTransportEvent::Connected => {}
                RelayTransportEvent::PacketReceived(packet) => {
                    transport.disconnect().await;
                    anyhow::ensure!(
                        packet.as_ref() == b"synthetic relay qualification",
                        "packet mismatch"
                    );
                    return Ok::<_, anyhow::Error>(());
                }
                _ => anyhow::bail!("unexpected relay event"),
            }
        }
    };
    operation
        .await
        .map_err(|error| JsValue::from_str(&format!("relay qualification failed: {error}")))
}
