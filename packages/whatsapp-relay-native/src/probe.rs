//! Bounded egress qualification using Cloudflare's public STUN server.
//! This sends no WhatsApp traffic and returns no mapped IP address.
use std::time::Duration;
use tokio::{
    net::{UdpSocket, lookup_host},
    time::timeout,
};

pub async fn udp_reachable() -> bool {
    timeout(Duration::from_secs(8), async {
        let endpoints = lookup_host("stun.cloudflare.com:3478").await.ok()?;
        let endpoint = endpoints.into_iter().find(|address| address.is_ipv4())?;
        let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
        socket.connect(endpoint).await.ok()?;
        let transaction: [u8; 12] = rand::random();
        let mut request = [0u8; 20];
        request[..8].copy_from_slice(&[0, 1, 0, 0, 0x21, 0x12, 0xa4, 0x42]);
        request[8..].copy_from_slice(&transaction);
        let mut response = [0u8; 2048];
        for _ in 0..3 {
            socket.send(&request).await.ok()?;
            if let Ok(Ok(size)) = timeout(Duration::from_secs(2), socket.recv(&mut response)).await
            {
                if valid_reply(&request, &response[..size]) {
                    return Some(());
                }
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
    .is_some()
}

fn valid_reply(request: &[u8; 20], response: &[u8]) -> bool {
    response.len() >= 20
        && response[..2] == [1, 1]
        && response[4..20] == request[4..20]
        && usize::from(u16::from_be_bytes([response[2], response[3]])) + 20 == response.len()
        && response.len().is_multiple_of(4)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_matching_complete_binding_success() {
        let request = [7; 20];
        let mut response = request;
        response[..4].copy_from_slice(&[1, 1, 0, 0]);
        assert!(valid_reply(&request, &response));
        assert!(!valid_reply(&request, &response[..19]));
        response[19] = 0;
        assert!(!valid_reply(&request, &response));
        response[19] = 7;
        response[3] = 4;
        assert!(!valid_reply(&request, &response));
    }
}
