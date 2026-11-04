//! Display identities from WhatsApp contact sync, user-info and group metadata.
use anyhow::Result;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use whatsapp_rust::{ProfilePictureRequest, ProfilePictureTarget, ProfilePictureType, prelude::*};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactName {
    pub jid: String,
    pub name: Option<String>,
    pub username: Option<String>,
    pub aliases: Vec<String>,
    pub timestamp: i64,
}

/// Event callbacks cannot await storage. The host drains these idempotent updates
/// during status, inbox and alarm processing; message durability is independent.
#[derive(Clone, Default)]
pub struct ContactUpdates(Arc<Mutex<HashMap<String, ContactName>>>);
impl ContactUpdates {
    pub fn drain(&self) -> Vec<ContactName> {
        self.0
            .lock()
            .unwrap()
            .drain()
            .map(|(_, value)| value)
            .collect()
    }
}
impl EventHandler for ContactUpdates {
    fn handle_event(&self, event: Arc<Event>) {
        let entry = match &*event {
            Event::ContactUpdate(value) => {
                let jid = value.jid.to_non_ad_string();
                let mut aliases = vec![jid.clone()];
                for alias in [&value.action.lid_jid, &value.action.pn_jid]
                    .into_iter()
                    .flatten()
                {
                    if crate::normalize_recipient(alias).is_ok() && !aliases.contains(alias) {
                        aliases.push(alias.clone());
                    }
                }
                ContactName {
                    jid,
                    name: value
                        .action
                        .full_name
                        .clone()
                        .or_else(|| value.action.first_name.clone())
                        .filter(|s| !s.trim().is_empty()),
                    username: value.action.username.clone(),
                    aliases,
                    timestamp: value.timestamp.timestamp_millis(),
                }
            }
            Event::ContactRemoved(value) => {
                let jid = value.jid.to_non_ad_string();
                ContactName {
                    aliases: vec![jid.clone()],
                    jid,
                    name: None,
                    username: None,
                    timestamp: value.timestamp.timestamp_millis(),
                }
            }
            _ => return,
        };
        let mut pending = self.0.lock().unwrap();
        if pending.len() < 10_000 || pending.contains_key(&entry.jid) {
            if pending
                .get(&entry.jid)
                .is_none_or(|previous| entry.timestamp >= previous.timestamp)
            {
                pending.insert(entry.jid.clone(), entry);
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub jid: String,
    pub name: Option<String>,
    pub username: Option<String>,
    pub phone: Option<String>,
    pub aliases: Vec<String>,
    // Internal SDK-to-host field; the host fetches bounded image bytes and strips this URL.
    pub photo_url: Option<String>,
}

/// Query actual names/handles and permitted thumbnails. Never derive a name from a JID.
pub async fn lookup(client: &Client, value: &str) -> Result<Profile> {
    let normalized = crate::normalize_recipient(value)?;
    let jid: Jid = normalized.parse()?;
    let mut profile = Profile {
        jid: normalized.clone(),
        name: None,
        username: None,
        phone: None,
        aliases: vec![normalized],
        photo_url: None,
    };
    if value.ends_with("@g.us") {
        if let Ok(group) = client.groups().fetch_metadata(&jid).await {
            profile.name = group.subject.or(group.notify);
        }
    } else {
        if let Ok(mut users) = client
            .contacts()
            .get_user_info(std::slice::from_ref(&jid))
            .await
        {
            if let Some(user) = users.remove(&jid) {
                profile.name = user.verified_name.and_then(|name| name.name);
                profile.username = user.username.map(|name| name.to_string());
                for alias in [user.pn_jid, user.lid].into_iter().flatten() {
                    let value = alias.to_non_ad_string();
                    if !profile.aliases.contains(&value) {
                        profile.aliases.push(value);
                    }
                }
            }
        }
        if let Ok(Some(mapping)) = client.get_lid_pn_entry(&jid).await {
            for alias in [
                format!("{}@s.whatsapp.net", mapping.phone_number),
                format!("{}@lid", mapping.lid),
            ] {
                if !profile.aliases.contains(&alias) {
                    profile.aliases.push(alias);
                }
            }
            profile.phone = Some(format!("+{}", mapping.phone_number));
        } else if jid.server.is_pn_family() {
            profile.phone = Some(format!("+{}", jid.user));
        }
        if [client.pn(), client.lid()]
            .into_iter()
            .flatten()
            .any(|own| own.to_non_ad() == jid)
        {
            profile.name = Some(client.push_name());
        }
    }
    let target = if value.ends_with("@g.us") {
        ProfilePictureTarget::Group(&jid)
    } else {
        ProfilePictureTarget::Contact(&jid)
    };
    if let Ok(result) = client
        .pictures()
        .lookup(
            ProfilePictureRequest::new(target, ProfilePictureType::Preview)
                .timeout(Some(Duration::from_secs(5))),
        )
        .await
    {
        profile.photo_url = result.into_found().map(|picture| picture.url);
    }
    Ok(profile)
}
