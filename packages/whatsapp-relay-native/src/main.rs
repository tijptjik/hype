//! Private, ephemeral media pipe. Account credentials and call keys stay in the Worker.
use std::{net::SocketAddr, sync::Arc};
use whatsapp_relay::{NativeDialer, RelayState, router};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("--probe-udp") {
        // Only a boolean escapes; STUN replies include this host's public address.
        let reachable = whatsapp_relay::probe::udp_reachable().await;
        println!("{{\"udpReachable\":{reachable}}}");
        return Ok(());
    }
    let token = std::env::var("WHATSOVER_RELAY_TOKEN")
        .map_err(|_| anyhow::anyhow!("WHATSOVER_RELAY_TOKEN is required"))?;
    let address: SocketAddr = std::env::var("WHATSOVER_RELAY_LISTEN")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()?;
    let state = RelayState::new(token, Arc::new(NativeDialer))?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    // Never log request headers, peer addresses, endpoint parameters or media.
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async {
            #[cfg(unix)]
            {
                let mut terminate =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("install termination handler");
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            #[cfg(not(unix))]
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
