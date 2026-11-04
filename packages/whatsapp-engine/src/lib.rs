//! HYPE hosted WhatsApp lifecycle, durable inbox, and idempotent send contract.
//! Hosts supply protocol storage, networking, runtime, and the message journal.

use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use whatsapp_rust::{InboundDurabilityHook, prelude::*};

pub mod content;
pub mod media;
pub mod profiles;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

/// The inbox projection is portable across desktop SQLite and Durable Objects.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxMessage {
    pub chat: String,
    pub sender: String,
    pub id: String,
    pub timestamp: i64,
    pub from_me: bool,
    pub text: Option<String>,
    // Retain the complete decoded projection, including non-text messages.
    pub payload: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextRequest {
    pub request_id: String,
    pub to: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<content::MessageTarget>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reaction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachment_id: Option<String>,
}

impl TextRequest {
    /// Normalize phone numbers while rejecting ambiguous local numbers/device JIDs.
    pub fn validated(mut self) -> Result<Self> {
        ensure!(
            !self.request_id.is_empty() && self.request_id.len() <= 128,
            "requestId must be 1–128 bytes"
        );
        ensure!(
            self.request_id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_.:".contains(&c)),
            "invalid requestId"
        );
        if let Some(reaction) = &self.reaction {
            ensure!(
                self.attachment_id.is_none()
                    && self.text.is_empty()
                    && self.reply_to.is_some()
                    && reaction.len() <= 64,
                "a reaction needs a target and at most 64 bytes, without text"
            );
        } else {
            ensure!(
                (self.attachment_id.is_some() || !self.text.trim().is_empty())
                    && self.text.len() <= 16_384,
                "text must be 1–16384 bytes"
            );
        }
        if let Some(id) = &self.attachment_id {
            ensure!(
                id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-'),
                "invalid attachment ID"
            );
        }
        if let Some(target) = &self.reply_to {
            target.validate()?;
        }
        self.to = normalize_recipient(&self.to)?;
        Ok(self)
    }

    pub fn message_id(&self) -> String {
        format!(
            "3EB0{}",
            &hex::encode_upper(Sha256::digest(self.request_id.as_bytes()))[..28]
        )
    }
}

pub fn normalize_recipient(input: &str) -> Result<String> {
    if let Some(phone) = input.strip_prefix('+') {
        let digits: String = phone
            .chars()
            .filter(|c| !matches!(c, ' ' | '-' | '(' | ')'))
            .collect();
        ensure!(
            (7..=15).contains(&digits.len())
                && !digits.starts_with('0')
                && digits.bytes().all(|c| c.is_ascii_digit()),
            "invalid international phone number"
        );
        return Ok(format!("{digits}@s.whatsapp.net"));
    }
    if let Some((user, server)) = input.split_once('@') {
        let valid_user = !user.is_empty()
            && user.len() <= 64
            && user
                .bytes()
                .all(|c| c.is_ascii_digit() || (server == "g.us" && c == b'-'));
        ensure!(
            valid_user && matches!(server, "s.whatsapp.net" | "g.us" | "lid"),
            "invalid recipient JID"
        );
        return Ok(input.into());
    }
    bail!("Use an international phone number (+852…), a group JID, or a LID")
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SendState {
    Pending,
    Submitted,
    Uncertain,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outbound {
    pub request: TextRequest,
    pub message_id: String,
    pub state: SendState,
}

pub enum Claim {
    New(Outbound),
    Existing(Outbound),
}

/// All operations must be durable before returning. Claims and batch writes are
/// atomic. A repeated key with a different recipient or body is an error.
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
pub trait Journal: wacore::sync_marker::MaybeSendSync {
    async fn receive(&self, messages: Vec<InboxMessage>) -> Result<()>;
    async fn claim(&self, request: TextRequest) -> Result<Claim>;
    async fn finish(&self, outbound: Outbound) -> Result<()>;
    async fn attachment(&self, id: &str) -> Result<Option<String>>;
    async fn lookup(
        &self,
        chat: &str,
        target: &content::MessageTarget,
    ) -> Result<Option<InboxMessage>>;
}

struct Capture(Arc<dyn Journal>);

#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
impl InboundDurabilityHook for Capture {
    async fn on_messages(&self, _client: Arc<Client>, batch: &[InboundMessage]) -> Result<()> {
        let messages = batch
            .iter()
            .map(|item| {
                Ok(InboxMessage {
                    chat: item.info.source.chat.to_string(),
                    sender: item.info.source.sender.to_string(),
                    id: item.info.id.to_string(),
                    timestamp: item.info.timestamp.timestamp_millis(),
                    from_me: item.info.source.is_from_me,
                    text: item.message.text_content().map(str::to_owned),
                    payload: serde_json::to_string(item)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        self.0.receive(messages).await
    }
}

/// Public account identity; protocol credentials remain in the private SDK store.
#[derive(Clone, Serialize)]
pub struct SessionIdentity {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    pub phone: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    pub logged_out: bool,
    pub qr: Option<String>,
    pub qr_expires_at: Option<i64>,
    pub last_event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<SessionIdentity>,
}

#[derive(Clone, Default)]
pub struct ConnectionStatus(Arc<Mutex<Status>>);

impl ConnectionStatus {
    /// QR credentials are returned only to the host's authenticated status API.
    pub fn snapshot(&self) -> Status {
        let mut status = self.0.lock().unwrap().clone();
        if status
            .qr_expires_at
            .is_some_and(|expires| expires <= wacore::time::now_millis())
        {
            status.qr = None;
            status.qr_expires_at = None;
        }
        status
    }
}

impl EventHandler for ConnectionStatus {
    fn handle_event(&self, event: Arc<Event>) {
        let mut status = self.0.lock().unwrap();
        status.last_event = Some(format!("{:?}", event.kind()));
        match &*event {
            Event::Connected(_) => {
                status.connected = true;
                status.logged_out = false;
                status.qr = None;
                status.qr_expires_at = None;
            }
            Event::Disconnected(_) => {
                status.connected = false;
            }
            Event::LoggedOut(_) => {
                status.connected = false;
                status.logged_out = true;
                status.qr = None;
                status.qr_expires_at = None;
            }
            Event::PairingQrCode(qr) => {
                status.qr = Some(qr.code.clone());
                status.qr_expires_at =
                    Some(wacore::time::now_millis() + qr.timeout.as_millis() as i64);
            }
            _ => {}
        }
    }
}

pub struct Engine {
    pub client: Arc<Client>,
    pub status: ConnectionStatus,
    pub contacts: profiles::ContactUpdates,
    journal: Arc<dyn Journal>,
    handle: Mutex<Option<BotHandle>>,
}

impl Engine {
    /// Builder ports are provided by each host; no host-specific I/O is used here.
    pub async fn start(
        builder: BotBuilder<
            whatsapp_rust::bot::Provided,
            whatsapp_rust::bot::Provided,
            whatsapp_rust::bot::Provided,
            whatsapp_rust::bot::Provided,
        >,
        journal: Arc<dyn Journal>,
    ) -> Result<Self> {
        let status = ConnectionStatus::default();
        let contacts = profiles::ContactUpdates::default();
        let bot = builder
            .with_event_handler(status.clone())
            .with_event_handler(contacts.clone())
            .with_inbound_durability_hook(Capture(journal.clone()))
            .build()
            .await?;
        let client = bot.client();
        Ok(Self {
            client,
            status,
            contacts,
            journal,
            handle: Mutex::new(Some(bot.spawn())),
        })
    }

    /// Persist intent before sending. A failed or interrupted attempt is never
    /// automatically resent: lack of acknowledgement does not prove non-delivery.
    pub async fn send(&self, request: TextRequest) -> Result<Outbound> {
        let request = request.validated()?;
        ensure!(
            self.status.snapshot().connected,
            "WhatsApp is not connected"
        );
        let target = if let Some(target) = &request.reply_to {
            Some(
                self.journal
                    .lookup(&request.to, target)
                    .await?
                    .ok_or_else(|| anyhow::anyhow!("target message is not in this conversation"))?,
            )
        } else {
            None
        };
        let mut message = if let Some(id) = &request.attachment_id {
            let payload = self.journal.attachment(id).await?.ok_or_else(|| {
                anyhow::anyhow!("attachment expired or does not belong to this account")
            })?;
            let mut media: wa::Message = serde_json::from_str(&payload)?;
            if media.image_message.is_set() {
                media.image_message.as_option_mut().unwrap().caption = Some(request.text.clone());
            } else if let Some(video) = media.video_message.as_option_mut() {
                video.caption = Some(request.text.clone());
            } else if let Some(document) = media.document_message.as_option_mut() {
                document.caption = Some(request.text.clone());
            } else {
                ensure!(
                    request.text.is_empty(),
                    "audio and stickers cannot have a caption"
                );
            }
            media
        } else {
            wa::Message::text(&request.text)
        };
        if let Some(target) = target.as_ref().filter(|_| request.reaction.is_none()) {
            let stored: content::StoredInbound = serde_json::from_str(&target.payload)?;
            ensure!(
                !stored.message.is_view_once(),
                "view-once content cannot be quoted"
            );
            let context = wacore::proto_helpers::build_quote_context(
                &target.id,
                &target.sender,
                &stored.message,
            );
            if request.attachment_id.is_some() {
                message.set_context_info(context);
            } else {
                message = wa::Message::text_with_context(&request.text, context);
            }
        }
        let mut outbound = match self.journal.claim(request).await? {
            Claim::Existing(previous) => return Ok(previous),
            Claim::New(outbound) => outbound,
        };
        let jid: Jid = outbound.request.to.parse()?;
        let options = SendOptions::default().with_message_id(MessageId::new(&outbound.message_id)?);
        let send = SendRequest::new(&jid, message).with_options(options);
        let result = if let Some(emoji) = &outbound.request.reaction {
            let target = target.as_ref().unwrap();
            let mut key = wa::MessageKey::default();
            key.id = Some(target.id.clone());
            key.remote_jid = Some(target.chat.clone());
            key.from_me = Some(target.from_me);
            key.participant = Some(target.sender.clone());
            self.client.send_reaction_raw(&jid, key, emoji).await
        } else {
            self.client.send(send).await
        };
        let mut local_echo = None;
        outbound.state = match result {
            Ok(sent) => {
                outbound.message_id = sent.message_id.to_string();
                if let Some(sender) = self.client.pn() {
                    local_echo = Some(InboxMessage {
                        chat: outbound.request.to.clone(), sender: sender.to_non_ad_string(),
                        id: outbound.message_id.clone(), timestamp: wacore::time::now_millis(), from_me: true,
                        text: sent.message.text_content().map(str::to_owned),
                        payload: serde_json::json!({ "message": sent.message, "info": { "push_name": self.client.push_name() } }).to_string(),
                    });
                }
                SendState::Submitted
            }
            Err(_) => SendState::Uncertain,
        };
        // Persist the outcome before adding UI history; a failed history write
        // must never turn a known send into a fresh retry opportunity.
        self.journal.finish(outbound.clone()).await?;
        if let Some(message) = local_echo {
            self.journal.receive(vec![message]).await?;
        }
        Ok(outbound)
    }

    pub async fn shutdown(&self) -> Result<BotShutdownReport> {
        let handle = self
            .handle
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| anyhow::anyhow!("session already stopped"))?;
        let report = handle.shutdown().await;
        *self.status.0.lock().unwrap() = Status::default();
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recipient_validation_does_not_guess_country_codes() {
        assert_eq!(
            normalize_recipient("+852 5555 0100").unwrap(),
            "85255550100@s.whatsapp.net"
        );
        for input in [
            "55550100",
            "name@example.com",
            "85255550100:2@s.whatsapp.net",
            "+00000000",
            "+852ABC1234",
        ] {
            assert!(normalize_recipient(input).is_err(), "{input}");
        }
        assert!(normalize_recipient("123456789-1234@g.us").is_ok());
    }
}
