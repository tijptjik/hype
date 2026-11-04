use anyhow::Result;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message, client::IntoClientRequest},
};
use whatsapp_rust::voip::{RelayTransport, RelayTransportEvent};
use whatsapp_relay::{RelayConnection, RelayDialer, RelayState, allowed_endpoint, router};

const TOKEN: &str = "synthetic_test_token_not_a_secret_123456";

#[derive(Default)]
struct EchoDialer {
    dials: AtomicUsize,
    closed: Arc<AtomicUsize>,
}
struct EchoRelay {
    tx: async_channel::Sender<RelayTransportEvent>,
    closed: Arc<AtomicUsize>,
}

#[async_trait::async_trait]
impl RelayTransport for EchoRelay {
    async fn send(&self, packet: Bytes) -> Result<()> {
        self.tx
            .send(RelayTransportEvent::PacketReceived(packet))
            .await?;
        Ok(())
    }
    async fn disconnect(&self) {
        self.closed.fetch_add(1, Ordering::SeqCst);
        self.tx.close();
    }
}

#[async_trait::async_trait]
impl RelayDialer for EchoDialer {
    async fn connect(&self, _: SocketAddr) -> Result<RelayConnection> {
        self.dials.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = async_channel::bounded(4);
        tx.send(RelayTransportEvent::Connected).await?;
        Ok((
            Arc::new(EchoRelay {
                tx,
                closed: self.closed.clone(),
            }),
            rx,
        ))
    }
}

async fn server() -> (String, Arc<EchoDialer>, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}/relay", listener.local_addr().unwrap());
    let dialer = Arc::new(EchoDialer::default());
    let app = router(RelayState::new(TOKEN.into(), dialer.clone()).unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (url, dialer, task)
}

fn request(url: &str, token: &str) -> tokio_tungstenite::tungstenite::http::Request<()> {
    let mut request = url.into_client_request().unwrap();
    request
        .headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    request
}

#[test]
fn rejects_non_public_and_transition_addresses() {
    for address in [
        "127.0.0.1:443",
        "169.254.169.254:80",
        "10.0.0.1:3478",
        "100.100.100.200:80",
        "192.0.2.1:443",
        "224.0.0.1:443",
        "8.8.8.8:0",
        "[::1]:443",
        "[::ffff:8.8.8.8]:443",
        "[fc00::1]:443",
        "[fe80::1]:443",
        "[2002:7f00:1::1]:443",
        "[2001:db8::1]:443",
    ] {
        assert!(!allowed_endpoint(address.parse().unwrap()), "{address}");
    }
    for address in ["157.240.1.1:3478", "[2a03:2880::1]:443"] {
        assert!(allowed_endpoint(address.parse().unwrap()), "{address}");
    }
}

#[tokio::test]
async fn authentication_precedes_any_dial() {
    let (url, dialer, task) = server().await;
    let result = connect_async(request(&url, "wrong")).await.unwrap_err();
    assert!(
        matches!(result, tokio_tungstenite::tungstenite::Error::Http(ref r) if r.status() == 401)
    );
    assert_eq!(dialer.dials.load(Ordering::SeqCst), 0);
    task.abort();
}

#[tokio::test]
async fn packets_roundtrip_and_websocket_close_releases_native_relay() {
    let (url, dialer, task) = server().await;
    let (mut ws, _) = connect_async(request(&url, TOKEN)).await.unwrap();
    ws.send(Message::Text(r#"{"endpoint":"157.240.1.1:3478"}"#.into()))
        .await
        .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap().into_text().unwrap(),
        r#"{"state":"connected"}"#
    );
    ws.send(Message::Binary(Bytes::from_static(
        b"synthetic opaque packet",
    )))
    .await
    .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap().into_data(),
        Bytes::from_static(b"synthetic opaque packet")
    );
    ws.send(Message::Text("ping".into())).await.unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap().into_text().unwrap(),
        "pong"
    );
    ws.close(None).await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), async {
        while dialer.closed.load(Ordering::SeqCst) != 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    task.abort();
}

#[tokio::test]
async fn refuses_private_endpoint_and_unbounded_session_count() {
    let (url, dialer, task) = server().await;
    let (mut ws, _) = connect_async(request(&url, TOKEN)).await.unwrap();
    ws.send(Message::Text(r#"{"endpoint":"127.0.0.1:80"}"#.into()))
        .await
        .unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(2), ws.next())
        .await
        .unwrap();
    assert_eq!(dialer.dials.load(Ordering::SeqCst), 0);
    let (a, _) = connect_async(request(&url, TOKEN)).await.unwrap();
    let (b, _) = connect_async(request(&url, TOKEN)).await.unwrap();
    let result = connect_async(request(&url, TOKEN)).await.unwrap_err();
    assert!(
        matches!(result, tokio_tungstenite::tungstenite::Error::Http(ref r) if r.status() == 429)
    );
    drop((a, b));
    task.abort();
}

#[tokio::test]
async fn oversized_frame_disconnects_without_forwarding() {
    let (url, dialer, task) = server().await;
    let (mut ws, _) = connect_async(request(&url, TOKEN)).await.unwrap();
    ws.send(Message::Text(r#"{"endpoint":"157.240.1.1:3478"}"#.into()))
        .await
        .unwrap();
    let _ = ws.next().await.unwrap().unwrap();
    ws.send(Message::Binary(vec![0; 65_537].into()))
        .await
        .unwrap();
    let result = tokio::time::timeout(Duration::from_secs(2), ws.next())
        .await
        .unwrap();
    assert!(!matches!(result, Some(Ok(Message::Binary(_)))));
    tokio::time::timeout(Duration::from_secs(2), async {
        while dialer.closed.load(Ordering::SeqCst) != 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    task.abort();
}
