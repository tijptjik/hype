//! Bounded media transfers. Private CDN descriptors never cross the UI boundary.
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use whatsapp_rust::{
    download::{DownloadLimits, Downloadable, MediaType},
    media::{AudioOptions, ImageOptions, VideoOptions, DocumentOptions, audio_message, image_message, video_message, document_message},
    prelude::*,
    upload::UploadOptions,
};

pub const MAX_MEDIA_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Upload {
    #[serde(default)]
    pub animated: bool,
    pub kind: String,
    pub mime_type: String,
    pub duration: Option<u32>,
    pub file_name: Option<String>,
}

impl Upload {
    /// Reject mislabeled browser recordings and active-content formats before upload.
    pub fn validate(&self, bytes: &[u8]) -> Result<MediaType> {
        ensure!(
            !bytes.is_empty() && bytes.len() <= MAX_MEDIA_BYTES,
            "media must be 1 byte to 8 MiB"
        );
        ensure!(self.file_name.as_ref().is_none_or(|name| name.len() <= 255 && !name.chars().any(char::is_control)), "invalid filename");
        ensure!(!self.animated || self.kind == "video", "GIF playback requires MP4 video");
        let webp = bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP");
        match (self.kind.as_str(), self.mime_type.as_str()) {
            ("image", "image/jpeg") if bytes.starts_with(&[0xff, 0xd8, 0xff]) => {
                Ok(MediaType::Image)
            }
            ("image", "image/png") if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => {
                Ok(MediaType::Image)
            }
            ("image", "image/webp") if webp => Ok(MediaType::Image),
            ("sticker", "image/webp") if webp && bytes.len() <= 512 * 1024 => {
                Ok(MediaType::Sticker)
            }
            ("audio", "audio/ogg; codecs=opus")
                if bytes.starts_with(b"OggS")
                    && bytes.windows(8).take(128).any(|s| s == b"OpusHead") =>
            {
                ensure!(
                    self.duration.is_some_and(|d| d > 0 && d <= 600),
                    "voice messages must be at most 10 minutes"
                );
                Ok(MediaType::Audio)
            }
            ("video", "video/mp4") if bytes.get(4..8) == Some(b"ftyp") => Ok(MediaType::Video),
            ("document", _) if !self.mime_type.is_empty() && self.mime_type.len() <= 100 => Ok(MediaType::Document),
            _ => anyhow::bail!("unsupported media format; use JPEG, PNG, WebP or Ogg Opus"),
        }
    }
}

/// Encrypt and upload once, returning a private message descriptor for staging.
pub async fn prepare(client: &Client, input: Upload, bytes: Vec<u8>) -> Result<wa::Message> {
    let media_type = input.validate(&bytes)?;
    let upload = client
        .upload(bytes, media_type, UploadOptions::default())
        .await?;
    Ok(match input.kind.as_str() {
        "image" => image_message(
            upload,
            ImageOptions::default().with_mimetype(input.mime_type),
        ),
        "audio" => audio_message(
            upload,
            AudioOptions::default()
                .with_mimetype(input.mime_type)
                .with_ptt(true)
                .with_duration_seconds(input.duration.unwrap()),
        ),
        "video" => video_message(upload, VideoOptions::default().with_mimetype(input.mime_type).with_gif_playback(input.animated)),
        "document" => document_message(upload, DocumentOptions::default().with_mimetype(input.mime_type).with_file_name(input.file_name.unwrap_or_else(|| "attachment".into()))),
        "sticker" => {
            let mut sticker = wa::message::StickerMessage::default();
            sticker.url = Some(upload.url);
            sticker.direct_path = Some(upload.direct_path);
            sticker.media_key = Some(upload.media_key.to_vec());
            sticker.file_sha256 = Some(upload.file_sha256.to_vec());
            sticker.file_enc_sha256 = Some(upload.file_enc_sha256.to_vec());
            sticker.file_length = Some(upload.file_length);
            sticker.media_key_timestamp = Some(upload.media_key_timestamp);
            sticker.mimetype = Some(input.mime_type);
            let mut message = wa::Message::default();
            message.sticker_message = waproto::buffa::MessageField::some(sticker);
            message
        }
        _ => unreachable!("validated above"),
    })
}

/// Download through the connected SDK, authenticating and decrypting the media.
/// Workers bounds each HTTP response to 16 MiB in host.js before Rust receives it;
/// the SDK's buffered CBC path decrypts in place (it cannot expand the input).
/// Do not advertise synchronous streaming support or SDK DownloadLimits on WASM.
pub async fn download(client: &Client, message: &wa::Message) -> Result<Vec<u8>> {
    ensure!(
        !message.is_view_once(),
        "view-once media must be opened in WhatsApp"
    );
    let base = message.get_base_message();
    let media: &dyn Downloadable = if let Some(m) = base.image_message.as_option() {
        m
    } else if let Some(m) = base.video_message.as_option() {
        m
    } else if let Some(m) = base.audio_message.as_option() {
        m
    } else if let Some(m) = base.sticker_message.as_option() {
        m
    } else if let Some(m) = base.document_message.as_option() {
        m
    } else {
        anyhow::bail!("this message has no downloadable media")
    };
    ensure!(
        media
            .file_length()
            .is_some_and(|n| n > 0 && n <= MAX_MEDIA_BYTES as u64),
        "media exceeds the 8 MiB limit or has no declared size"
    );
    #[cfg(target_arch = "wasm32")]
    let limits = DownloadLimits::default();
    #[cfg(not(target_arch = "wasm32"))]
    let limits = DownloadLimits::new((MAX_MEDIA_BYTES + 32) as u64, MAX_MEDIA_BYTES as u64);
    let bytes = client.download(media, limits).await?;
    ensure!(
        bytes.len() <= MAX_MEDIA_BYTES,
        "media exceeds the 8 MiB limit"
    );
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_mislabeled_browser_audio_and_active_images() {
        let audio = Upload {
            animated: false,
            kind: "audio".into(),
            mime_type: "audio/ogg; codecs=opus".into(),
            duration: Some(5),
            file_name: None,
        };
        assert!(audio.validate(b"\x1a\x45\xdf\xa3webm").is_err());
        let image = Upload {
            animated: false,
            kind: "image".into(),
            mime_type: "image/png".into(),
            duration: None,
            file_name: None,
        };
        assert!(image.validate(b"<svg onload='alert(1)'></svg>").is_err());
        assert!(image.validate(b"\x89PNG\r\n\x1a\nsynthetic").is_ok());
    }
}
