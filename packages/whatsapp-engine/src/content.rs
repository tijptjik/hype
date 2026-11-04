//! Public message projections. Protocol keys, CDN URLs and full payloads stay private.
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use whatsapp_rust::prelude::*;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessageTarget {
    pub id: String,
    pub sender: String,
}

impl MessageTarget {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.id.is_empty() && self.id.len() <= 128,
            "invalid target message ID"
        );
        crate::normalize_recipient(&self.sender)?;
        Ok(())
    }
}

#[derive(Deserialize)]
pub struct StoredInbound {
    pub message: wa::Message,
    #[serde(default)]
    pub info: serde_json::Value,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    #[serde(default)]
    pub animated: bool,
    pub kind: String,
    pub text: Option<String>,
    pub mime_type: Option<String>,
    pub file_name: Option<String>,
    pub byte_length: Option<u64>,
    pub duration: Option<u32>,
    pub voice_note: bool,
    pub view_once: bool,
    pub quoted: Option<Quote>,
    pub reaction: Option<Reaction>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub sender: String,
    pub text: Option<String>,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reaction {
    pub target_id: String,
    pub target_sender: Option<String>,
    pub target_from_me: bool,
    pub emoji: String,
}

/// Project only fields needed by the conversation UI, including legacy stored rows.
pub fn project_stored(payload: &str) -> Result<serde_json::Value> {
    let stored: StoredInbound = match serde_json::from_str(payload) {
        Ok(stored) => stored,
        // Future protocol shapes must not poison a whole inbox page or stall
        // its durable cursor. Preserve the row as unsupported, without payload.
        Err(_) => {
            return Ok(
                serde_json::json!({ "content": Content { kind: "unsupported".into(), ..Default::default() }, "senderName": null }),
            );
        }
    };
    Ok(serde_json::json!({
        "content": project(&stored.message),
        "senderName": stored.info.get("push_name").and_then(|value| value.as_str()).filter(|name| !name.is_empty()),
    }))
}

pub fn project(message: &wa::Message) -> Content {
    let base = message.get_base_message();
    let mut content = Content {
        kind: "unsupported".into(),
        text: base
            .text_content()
            .or_else(|| base.get_caption())
            .map(str::to_owned),
        view_once: message.is_view_once(),
        ..Default::default()
    };
    if base.conversation.is_some() || base.extended_text_message.is_set() {
        content.kind = "text".into();
    } else if let Some(media) = base.image_message.as_option() {
        content.kind = "image".into();
        content.mime_type = media.mimetype.clone();
        content.byte_length = media.file_length;
    } else if let Some(media) = base.video_message.as_option() {
        content.kind = "video".into();
        content.animated = media.gif_playback.unwrap_or(false);
        content.mime_type = media.mimetype.clone();
        content.byte_length = media.file_length;
        content.duration = media.seconds;
    } else if let Some(media) = base.audio_message.as_option() {
        content.kind = "audio".into();
        content.mime_type = media.mimetype.clone();
        content.byte_length = media.file_length;
        content.duration = media.seconds;
        content.voice_note = media.ptt.unwrap_or(false);
    } else if let Some(media) = base.sticker_message.as_option() {
        content.kind = "sticker".into();
        content.mime_type = media.mimetype.clone();
        content.byte_length = media.file_length;
    } else if let Some(media) = base.document_message.as_option() {
        content.kind = "document".into();
        content.mime_type = media.mimetype.clone();
        content.byte_length = media.file_length;
        content.file_name = media.file_name.clone();
    } else if let Some(reaction) = base.reaction_message.as_option() {
        content.kind = "reaction".into();
        if let Some(key) = reaction.key.as_option() {
            content.reaction = Some(Reaction {
                target_id: key.id.clone().unwrap_or_default(),
                target_sender: key.participant.clone(),
                target_from_me: key.from_me.unwrap_or(false),
                emoji: reaction.text.clone().unwrap_or_default(),
            });
        }
    } else if base.protocol_message.is_set() || base.sender_key_distribution_message.is_set() {
        content.kind = "protocol".into();
    }
    if let Some(context) = base.context_info()
        && let Some(id) = &context.stanza_id
    {
        // Do not recursively expose quote chains or any quoted media credentials.
        let quote = context.quoted_message.as_option();
        content.quoted = Some(Quote {
            id: id.clone(),
            sender: context.participant.clone().unwrap_or_default(),
            text: quote
                .and_then(|m| m.text_content().or_else(|| m.get_caption()))
                .map(str::to_owned),
            kind: if quote.is_some_and(|m| m.text_content().is_some()) {
                "text"
            } else {
                "media"
            }
            .into(),
        });
    }
    content
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_preserve_text_without_protocol_credentials() {
        let original = wa::Message::text("Hello 👋");
        let quote = wacore::proto_helpers::build_quote_context(
            "original",
            "15555550100@s.whatsapp.net",
            &original,
        );
        let projected = project(&wa::Message::text_with_context("A reply", quote));
        assert_eq!(projected.kind, "text");
        assert_eq!(projected.quoted.unwrap().text.as_deref(), Some("Hello 👋"));
    }

    #[test]
    fn image_projection_never_contains_keys_or_download_urls() {
        let message: wa::Message = serde_json::from_value(serde_json::json!({
            "image_message": {"url":"https://private.invalid/token", "media_key":[1,2,3], "mimetype":"image/jpeg", "caption":"Photo"}
        })).unwrap();
        let projected = project(&message);
        assert_eq!(projected.kind, "image");
        assert_eq!(projected.text.as_deref(), Some("Photo"));
        let json = serde_json::to_string(&projected).unwrap();
        assert!(!json.contains("private.invalid") && !json.contains("mediaKey"));
    }

    #[test]
    fn protocol_messages_are_identified_without_discarding_unknown_content() {
        let protocol: wa::Message =
            serde_json::from_value(serde_json::json!({"protocol_message":{}})).unwrap();
        assert_eq!(project(&protocol).kind, "protocol");
        assert_eq!(project(&wa::Message::default()).kind, "unsupported");
    }
}
