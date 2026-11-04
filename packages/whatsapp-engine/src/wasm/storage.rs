//! SQLite DO adapter. Every read/modify/batch sequence is synchronous until the
//! final durability barrier, so another event cannot interleave with a merge.
use bytes::Bytes;
use js_sys::{Array, Promise, Uint8Array};
use send_wrapper::SendWrapper;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{collections::HashMap, sync::Arc};
use wacore::{
    appstate::{hash::HashState, processor::AppStateMutationMAC},
    store::{
        Device,
        error::{Result, StoreError},
        traits::*,
    },
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

const MAX_ROW: u32 = 4 * 1024 * 1024;
type Key = (String, String, String, String);
fn key(bucket: &str, first: &str, second: &str, third: &str) -> Key {
    (bucket.into(), first.into(), second.into(), third.into())
}
fn one(bucket: &str, first: &str) -> Key {
    key(bucket, first, "", "")
}
fn invalid(message: &str) -> StoreError {
    StoreError::Validation(message.into())
}
fn js_error(_: JsValue) -> StoreError {
    invalid("Durable Object storage operation failed")
}
fn encode<T: Serialize + ?Sized>(value: &T) -> Result<Vec<u8>> {
    serde_json::to_vec(value).map_err(|e| StoreError::Serialization(Box::new(e)))
}
fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(bytes).map_err(|e| StoreError::Serialization(Box::new(e)))
}
fn js<T: Serialize + ?Sized>(value: &T) -> Result<JsValue> {
    value
        .serialize(
            &serde_wasm_bindgen::Serializer::new()
                .serialize_missing_as_null(true)
                .serialize_maps_as_objects(true),
        )
        .map_err(|_| invalid("host argument serialization failed"))
}

#[wasm_bindgen]
extern "C" {
    pub type Database;
    #[wasm_bindgen(method, catch, js_name = read)]
    fn read_js(this: &Database, key: &JsValue, max: u32) -> std::result::Result<JsValue, JsValue>;
    #[wasm_bindgen(method, catch, js_name = scan)]
    fn scan_js(
        this: &Database,
        bucket: &str,
        first: Option<String>,
        rows: u32,
        bytes: u32,
    ) -> std::result::Result<JsValue, JsValue>;
    #[wasm_bindgen(method, catch, js_name = batch)]
    fn batch_js(this: &Database, operations: &JsValue) -> std::result::Result<u32, JsValue>;
    #[wasm_bindgen(method, catch, js_name = pendingSenders)]
    fn senders_js(this: &Database, chat: &str, id: &str) -> std::result::Result<Array, JsValue>;
    #[wasm_bindgen(method, js_name = sync)]
    fn sync_js(this: &Database) -> Promise;
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Mutation {
    Put {
        key: Key,
        #[serde(with = "serde_bytes")]
        value: Vec<u8>,
        timestamp: i64,
    },
    Delete {
        key: Key,
    },
    Clear {
        bucket: String,
        first: Option<String>,
    },
    Expire {
        bucket: String,
        before: i64,
    },
}
fn put(key: Key, value: Vec<u8>) -> Mutation {
    Mutation::Put {
        key,
        value,
        timestamp: wacore::time::now_millis() / 1000,
    }
}
fn set<T: Serialize + ?Sized>(key: Key, value: &T) -> Result<Mutation> {
    Ok(put(key, encode(value)?))
}
fn del(key: Key) -> Mutation {
    Mutation::Delete { key }
}

#[derive(Deserialize)]
struct Row {
    first: String,
    second: String,
    third: String,
    #[serde(with = "serde_bytes")]
    value: Vec<u8>,
}

pub struct DoBackend {
    db: SendWrapper<Database>,
}

impl DoBackend {
    pub fn new(db: Database) -> Self {
        Self {
            db: SendWrapper::new(db),
        }
    }
    fn read(&self, key: Key, max: u32) -> Result<Option<Vec<u8>>> {
        let value = self.db.read_js(&js(&key)?, max).map_err(js_error)?;
        if value.is_null() || value.is_undefined() {
            Ok(None)
        } else {
            Ok(Some(Uint8Array::new(&value).to_vec()))
        }
    }
    fn get<T: DeserializeOwned>(&self, key: Key) -> Result<Option<T>> {
        self.read(key, MAX_ROW)?.map(|b| decode(&b)).transpose()
    }
    fn scan(&self, bucket: &str, first: Option<&str>) -> Result<Vec<Row>> {
        let value = self
            .db
            .scan_js(bucket, first.map(str::to_owned), 10_000, 16 * 1024 * 1024)
            .map_err(js_error)?;
        serde_wasm_bindgen::from_value(value).map_err(|_| invalid("invalid host scan result"))
    }
    async fn commit(&self, ops: Vec<Mutation>) -> Result<u32> {
        let written = self.db.batch_js(&js(&ops)?).map_err(js_error)?;
        JsFuture::from(self.db.sync_js()).await.map_err(js_error)?;
        Ok(written)
    }
    async fn write(&self, ops: Vec<Mutation>) -> Result<()> {
        self.commit(ops).await.map(|_| ())
    }
    async fn clear(&self, bucket: &str, first: Option<&str>) -> Result<()> {
        self.write(vec![Mutation::Clear {
            bucket: bucket.into(),
            first: first.map(str::to_owned),
        }])
        .await
    }
    async fn expire(&self, bucket: &str, before: i64) -> Result<u32> {
        self.commit(vec![Mutation::Expire {
            bucket: bucket.into(),
            before,
        }])
        .await
    }
}

#[async_trait::async_trait(?Send)]
impl SignalStore for DoBackend {
    async fn put_identity(&self, address: &str, value: [u8; 32]) -> Result<()> {
        self.write(vec![put(one("identity", address), value.to_vec())])
            .await
    }
    async fn load_identity(&self, address: &str) -> Result<Option<[u8; 32]>> {
        self.read(one("identity", address), 32)?
            .map(|b| b.try_into().map_err(|_| invalid("invalid identity length")))
            .transpose()
    }
    async fn delete_identity(&self, address: &str) -> Result<()> {
        self.write(vec![del(one("identity", address))]).await
    }
    async fn get_session(&self, address: &str) -> Result<Option<Bytes>> {
        Ok(self
            .read(one("session", address), MAX_ROW)?
            .map(Bytes::from))
    }
    async fn put_session(&self, address: &str, session: &[u8]) -> Result<()> {
        self.write(vec![put(one("session", address), session.to_vec())])
            .await
    }
    async fn put_sessions_batch(&self, sessions: &[(Arc<str>, Bytes)]) -> Result<()> {
        self.write(
            sessions
                .iter()
                .map(|(k, v)| put(one("session", k), v.to_vec()))
                .collect(),
        )
        .await
    }
    async fn delete_session(&self, address: &str) -> Result<()> {
        self.write(vec![del(one("session", address))]).await
    }
    async fn store_prekey(&self, id: u32, record: &[u8], uploaded: bool) -> Result<()> {
        self.write(vec![
            put(one("prekey", &id.to_string()), record.to_vec()),
            set(one("prekey_uploaded", &id.to_string()), &uploaded)?,
        ])
        .await
    }
    async fn load_prekey(&self, id: u32) -> Result<Option<Bytes>> {
        Ok(self
            .read(one("prekey", &id.to_string()), MAX_ROW)?
            .map(Bytes::from))
    }
    async fn mark_prekeys_uploaded(&self, ids: &[u32]) -> Result<()> {
        self.write(
            ids.iter()
                .map(|id| set(one("prekey_uploaded", &id.to_string()), &true))
                .collect::<Result<_>>()?,
        )
        .await
    }
    async fn remove_prekey(&self, id: u32) -> Result<()> {
        self.write(vec![
            del(one("prekey", &id.to_string())),
            del(one("prekey_uploaded", &id.to_string())),
        ])
        .await
    }
    async fn get_max_prekey_id(&self) -> Result<u32> {
        self.scan("prekey", None)?
            .iter()
            .map(|r| {
                r.first
                    .parse::<u32>()
                    .map_err(|_| invalid("invalid prekey ID"))
            })
            .try_fold(0, |a, b| Ok(a.max(b?)))
    }
    async fn store_signed_prekey(&self, id: u32, record: &[u8]) -> Result<()> {
        self.write(vec![put(
            one("signed_prekey", &id.to_string()),
            record.to_vec(),
        )])
        .await
    }
    async fn load_signed_prekey(&self, id: u32) -> Result<Option<Vec<u8>>> {
        self.read(one("signed_prekey", &id.to_string()), MAX_ROW)
    }
    async fn load_all_signed_prekeys(&self) -> Result<Vec<(u32, Vec<u8>)>> {
        self.scan("signed_prekey", None)?
            .into_iter()
            .map(|r| {
                Ok((
                    r.first
                        .parse()
                        .map_err(|_| invalid("invalid signed prekey ID"))?,
                    r.value,
                ))
            })
            .collect()
    }
    async fn remove_signed_prekey(&self, id: u32) -> Result<()> {
        self.write(vec![del(one("signed_prekey", &id.to_string()))])
            .await
    }
    async fn put_sender_key(&self, address: &str, record: &[u8]) -> Result<()> {
        self.write(vec![put(one("sender_key", address), record.to_vec())])
            .await
    }
    async fn get_sender_key(&self, address: &str) -> Result<Option<Vec<u8>>> {
        self.read(one("sender_key", address), MAX_ROW)
    }
    async fn delete_sender_key(&self, address: &str) -> Result<()> {
        self.write(vec![del(one("sender_key", address))]).await
    }
}

#[async_trait::async_trait(?Send)]
impl AppSyncStore for DoBackend {
    async fn get_sync_key(&self, id: &[u8]) -> Result<Option<AppStateSyncKey>> {
        self.get(one("sync_key", &hex::encode(id)))
    }
    async fn set_sync_key(&self, id: &[u8], value: AppStateSyncKey) -> Result<()> {
        self.write(vec![
            set(one("sync_key", &hex::encode(id)), &value)?,
            put(one("meta", "latest_sync_key"), id.to_vec()),
        ])
        .await
    }
    async fn get_version(&self, name: &str) -> Result<Option<HashState>> {
        self.get(one("version", name))
    }
    async fn delete_version(&self, name: &str) -> Result<()> {
        self.write(vec![del(one("version", name))]).await
    }
    async fn set_version(&self, name: &str, state: HashState) -> Result<()> {
        self.write(vec![set(one("version", name), &state)?]).await
    }
    async fn put_mutation_macs(
        &self,
        name: &str,
        _version: u64,
        mutations: &[AppStateMutationMAC],
    ) -> Result<()> {
        self.write(
            mutations
                .iter()
                .map(|m| {
                    put(
                        key("mac", name, &hex::encode(&m.index_mac), ""),
                        m.value_mac.clone(),
                    )
                })
                .collect(),
        )
        .await
    }
    async fn get_mutation_mac(&self, name: &str, index: &[u8]) -> Result<Option<Vec<u8>>> {
        self.read(key("mac", name, &hex::encode(index), ""), MAX_ROW)
    }
    async fn delete_mutation_macs(&self, name: &str, indexes: &[Vec<u8>]) -> Result<()> {
        self.write(
            indexes
                .iter()
                .map(|id| del(key("mac", name, &hex::encode(id), "")))
                .collect(),
        )
        .await
    }
    async fn commit_patch(
        &self,
        name: &str,
        state: HashState,
        removed: &[Vec<u8>],
        added: &[AppStateMutationMAC],
    ) -> Result<()> {
        let mut ops = vec![set(one("version", name), &state)?];
        ops.extend(
            removed
                .iter()
                .map(|id| del(key("mac", name, &hex::encode(id), ""))),
        );
        ops.extend(added.iter().map(|m| {
            put(
                key("mac", name, &hex::encode(&m.index_mac), ""),
                m.value_mac.clone(),
            )
        }));
        self.write(ops).await
    }
    async fn clear_mutation_macs(&self, name: &str) -> Result<()> {
        self.clear("mac", Some(name)).await
    }
    async fn get_latest_sync_key_id(&self) -> Result<Option<Vec<u8>>> {
        self.read(one("meta", "latest_sync_key"), MAX_ROW)
    }
}

#[async_trait::async_trait(?Send)]
impl ProtocolStore for DoBackend {
    async fn get_sender_key_devices(&self, group: &str) -> Result<Vec<(String, bool)>> {
        self.scan("sender_device", Some(group))?
            .into_iter()
            .map(|r| Ok((r.second, decode(&r.value)?)))
            .collect()
    }
    async fn set_sender_key_status(&self, group: &str, entries: &[(&str, bool)]) -> Result<()> {
        self.write(
            entries
                .iter()
                .map(|(device, has)| set(key("sender_device", group, device, ""), has))
                .collect::<Result<_>>()?,
        )
        .await
    }
    async fn clear_sender_key_devices(&self, group: &str) -> Result<()> {
        self.clear("sender_device", Some(group)).await
    }
    async fn delete_sender_key_device_rows(&self, devices: &[&str]) -> Result<()> {
        self.write(
            self.scan("sender_device", None)?
                .into_iter()
                .filter(|r| devices.contains(&r.second.as_str()))
                .map(|r| del(key("sender_device", &r.first, &r.second, &r.third)))
                .collect(),
        )
        .await
    }
    async fn clear_all_sender_key_devices(&self) -> Result<()> {
        self.clear("sender_device", None).await
    }
    async fn get_lid_mapping(&self, lid: &str) -> Result<Option<LidPnMappingEntry>> {
        self.get(one("lid", lid))
    }
    async fn get_pn_mapping(&self, phone: &str) -> Result<Option<LidPnMappingEntry>> {
        let lid: Option<String> = self.get(one("pn", phone))?;
        lid.map(|id| self.get(one("lid", &id)))
            .transpose()
            .map(Option::flatten)
    }
    async fn put_lid_mapping(&self, entry: &LidPnMappingEntry) -> Result<()> {
        let mut ops = vec![];
        if let Some(old) = self.get::<LidPnMappingEntry>(one("lid", &entry.lid))? {
            if old.phone_number != entry.phone_number
                && self.get::<String>(one("pn", &old.phone_number))?.as_deref() == Some(&entry.lid)
            {
                ops.push(del(one("pn", &old.phone_number)));
            }
        }
        ops.push(set(one("lid", &entry.lid), entry)?);
        ops.push(set(one("pn", &entry.phone_number), &entry.lid)?);
        self.write(ops).await
    }
    async fn get_all_lid_mappings(&self) -> Result<Vec<LidPnMappingEntry>> {
        self.scan("lid", None)?
            .into_iter()
            .map(|r| decode(&r.value))
            .collect()
    }
    async fn save_base_key(&self, address: &str, id: &str, bytes: &[u8]) -> Result<()> {
        self.write(vec![put(key("base_key", address, id, ""), bytes.to_vec())])
            .await
    }
    async fn has_same_base_key(&self, address: &str, id: &str, bytes: &[u8]) -> Result<bool> {
        Ok(self
            .read(key("base_key", address, id, ""), MAX_ROW)?
            .as_deref()
            == Some(bytes))
    }
    async fn delete_base_key(&self, address: &str, id: &str) -> Result<()> {
        self.write(vec![del(key("base_key", address, id, ""))])
            .await
    }
    async fn delete_expired_base_keys(&self, cutoff: i64) -> Result<u32> {
        self.expire("base_key", cutoff).await
    }
    async fn update_device_list(&self, record: DeviceListRecord) -> Result<()> {
        self.write(vec![set(one("devices", &record.user), &record)?])
            .await
    }
    async fn get_devices(&self, user: &str) -> Result<Option<DeviceListRecord>> {
        self.get(one("devices", user))
    }
    async fn delete_devices(&self, user: &str) -> Result<()> {
        self.write(vec![del(one("devices", user))]).await
    }
    async fn get_group_metadata(&self, group: &str) -> Result<Option<Vec<u8>>> {
        self.read(one("group", group), MAX_ROW)
    }
    async fn put_group_metadata(&self, group: &str, blob: &[u8]) -> Result<()> {
        self.write(vec![put(one("group", group), blob.to_vec())])
            .await
    }
    async fn delete_group_metadata(&self, group: &str) -> Result<()> {
        self.write(vec![del(one("group", group))]).await
    }
    async fn get_tc_token(&self, jid: &str) -> Result<Option<TcTokenEntry>> {
        self.get(one("token", jid))
    }
    async fn put_tc_token(&self, jid: &str, token: &TcTokenEntry) -> Result<()> {
        self.write(vec![set(one("token", jid), token)?]).await
    }
    async fn delete_tc_token(&self, jid: &str) -> Result<()> {
        self.write(vec![del(one("token", jid))]).await
    }
    async fn get_all_tc_token_jids(&self) -> Result<Vec<String>> {
        Ok(self
            .scan("token", None)?
            .into_iter()
            .map(|r| r.first)
            .collect())
    }
    async fn delete_expired_tc_tokens(&self, token_cutoff: i64, sender_cutoff: i64) -> Result<u32> {
        let mut ops = vec![];
        for row in self.scan("token", None)? {
            let entry: TcTokenEntry = decode(&row.value)?;
            if (entry.token.is_empty() || entry.token_timestamp < token_cutoff)
                && entry.sender_timestamp.is_none_or(|t| t < sender_cutoff)
            {
                ops.push(del(one("token", &row.first)));
            }
        }
        self.commit(ops).await
    }
    async fn touch_tc_token_sender_timestamp(&self, jid: &str, timestamp: i64) -> Result<()> {
        let mut entry: TcTokenEntry = self.get(one("token", jid))?.unwrap_or(TcTokenEntry {
            token: vec![],
            token_timestamp: timestamp,
            sender_timestamp: None,
        });
        entry.sender_timestamp = Some(
            entry
                .sender_timestamp
                .map_or(timestamp, |old| old.max(timestamp)),
        );
        self.write(vec![set(one("token", jid), &entry)?]).await
    }
    async fn store_received_tc_token(&self, jid: &str, token: &[u8], timestamp: i64) -> Result<()> {
        let mut entry: TcTokenEntry = self.get(one("token", jid))?.unwrap_or(TcTokenEntry {
            token: vec![],
            token_timestamp: timestamp,
            sender_timestamp: None,
        });
        if entry.token.is_empty() || timestamp >= entry.token_timestamp {
            entry.token = token.to_vec();
            entry.token_timestamp = timestamp;
        }
        self.write(vec![set(one("token", jid), &entry)?]).await
    }
    async fn store_sent_message(&self, chat: &str, id: &str, payload: &[u8]) -> Result<()> {
        self.write(vec![put(key("sent", chat, id, ""), payload.to_vec())])
            .await
    }
    async fn get_sent_message(&self, chat: &str, id: &str) -> Result<Option<Vec<u8>>> {
        self.read(key("sent", chat, id, ""), MAX_ROW)
    }
    async fn take_sent_message(&self, chat: &str, id: &str) -> Result<Option<Vec<u8>>> {
        let value = self.read(key("sent", chat, id, ""), MAX_ROW)?;
        self.write(vec![del(key("sent", chat, id, ""))]).await?;
        Ok(value)
    }
    async fn delete_expired_sent_messages(&self, cutoff: i64) -> Result<u32> {
        self.expire("sent", cutoff).await
    }
    async fn store_pending_inbound(
        &self,
        chat: &str,
        sender: &str,
        id: &str,
        bytes: &[u8],
    ) -> Result<()> {
        self.write(vec![put(key("pending", chat, sender, id), bytes.to_vec())])
            .await
    }
    async fn get_pending_inbound(
        &self,
        chat: &str,
        sender: &str,
        id: &str,
    ) -> Result<Option<Vec<u8>>> {
        self.read(key("pending", chat, sender, id), MAX_ROW)
    }
    async fn delete_pending_inbound(&self, chat: &str, sender: &str, id: &str) -> Result<()> {
        self.write(vec![del(key("pending", chat, sender, id))])
            .await
    }
    async fn delete_expired_pending_inbound(&self, cutoff: i64) -> Result<u32> {
        self.expire("pending", cutoff).await
    }
    async fn read_pending_inbound_bounded(
        &self,
        k: PendingInboundKey<'_>,
        max: usize,
        lease: PendingInboundLease,
    ) -> Result<Option<PendingInboundRecord>> {
        Ok(self
            .read(
                key("pending", k.chat, k.sender, k.id),
                max.min(MAX_ROW as usize) as u32,
            )?
            .map(|b| PendingInboundRecord::new(b, lease)))
    }
    async fn read_pending_inbound_group_bounded(
        &self,
        k: PendingInboundKey<'_>,
        max: usize,
        lease: PendingInboundLease,
    ) -> Result<Option<(String, PendingInboundRecord)>> {
        let senders: Vec<String> = self
            .db
            .senders_js(k.chat, k.id)
            .map_err(js_error)?
            .iter()
            .map(|s| s.as_string().ok_or_else(|| invalid("invalid group sender")))
            .collect::<Result<_>>()?;
        let sender = pending_group_sender(&mut senders.iter().map(|s| Some(s.as_str())), k.sender)?;
        match sender {
            None => Ok(None),
            Some(sender) => Ok(self
                .read(
                    key("pending", k.chat, &sender, k.id),
                    max.min(MAX_ROW as usize) as u32,
                )?
                .map(|b| (sender, PendingInboundRecord::new(b, lease)))),
        }
    }
    async fn replace_pending_inbound_if(
        &self,
        k: PendingInboundKey<'_>,
        expected: PendingInboundRevision,
        replacement: PendingInboundPayload,
        max: usize,
    ) -> Result<PendingInboundMutation> {
        if replacement.bytes().len() > max || replacement.bytes().len() > MAX_ROW as usize {
            return Err(invalid("replacement exceeds pending byte bound"));
        }
        let key = key("pending", k.chat, k.sender, k.id);
        let old = self.read(key.clone(), max.min(MAX_ROW as usize) as u32)?;
        let revision = old.as_deref().map_or(
            PendingInboundRevision::missing(),
            PendingInboundRevision::for_bytes,
        );
        if revision != expected && revision != replacement.revision() {
            return Ok(PendingInboundMutation::Conflict);
        }
        self.write(vec![put(key, replacement.bytes().to_vec())])
            .await?;
        // Keep the owner lease through the write barrier, including cancellation.
        drop(replacement);
        Ok(PendingInboundMutation::Applied)
    }
    async fn delete_pending_inbound_if(
        &self,
        k: PendingInboundKey<'_>,
        expected: PendingInboundRevision,
        max: usize,
        lease: PendingInboundLease,
    ) -> Result<PendingInboundMutation> {
        let key = key("pending", k.chat, k.sender, k.id);
        let old = self.read(key.clone(), max.min(MAX_ROW as usize) as u32)?;
        let revision = old.as_deref().map_or(
            PendingInboundRevision::missing(),
            PendingInboundRevision::for_bytes,
        );
        if revision != expected {
            return Ok(PendingInboundMutation::Conflict);
        }
        self.write(vec![del(key)]).await?;
        drop(lease);
        Ok(PendingInboundMutation::Applied)
    }
    async fn store_pending_inbound_batch(&self, rows: &[PendingInboundRow<'_>]) -> Result<()> {
        self.write(
            rows.iter()
                .map(|r| put(key("pending", r.chat, r.sender, r.id), r.message.to_vec()))
                .collect(),
        )
        .await
    }
    async fn delete_pending_inbound_batch(&self, keys: &[PendingInboundKey<'_>]) -> Result<()> {
        self.write(
            keys.iter()
                .map(|k| del(key("pending", k.chat, k.sender, k.id)))
                .collect(),
        )
        .await
    }
}

#[async_trait::async_trait(?Send)]
impl DeviceStore for DoBackend {
    async fn save(&self, device: &Device) -> Result<()> {
        self.write(vec![set(one("meta", "device"), device)?]).await
    }
    async fn load(&self) -> Result<Option<Device>> {
        self.get(one("meta", "device"))
    }
    async fn exists(&self) -> Result<bool> {
        Ok(self.read(one("meta", "device"), MAX_ROW)?.is_some())
    }
    async fn create(&self) -> Result<i32> {
        if self.read(one("meta", "device"), MAX_ROW)?.is_none() {
            self.write(vec![set(one("meta", "device"), &Device::new())?])
                .await?;
        }
        Ok(1)
    }
}

#[async_trait::async_trait(?Send)]
impl MsgSecretStore for DoBackend {
    async fn put_msg_secrets(&self, entries: Vec<MsgSecretEntry>) -> Result<usize> {
        let count = entries.len();
        let mut merged: HashMap<Key, MsgSecretEntry> = HashMap::new();
        for mut entry in entries {
            let k = key("secret", &entry.chat, &entry.sender, &entry.msg_id);
            let old = match merged.remove(&k) {
                Some(value) => Some(value),
                None => self.get::<MsgSecretEntry>(k.clone())?,
            };
            if let Some(old) = old {
                entry.expires_at = merge_msg_secret_expiry(old.expires_at, entry.expires_at);
                entry.message_ts = merge_msg_secret_message_ts(old.message_ts, entry.message_ts);
            }
            merged.insert(k, entry);
        }
        self.write(
            merged
                .into_iter()
                .map(|(k, v)| set(k, &v))
                .collect::<Result<_>>()?,
        )
        .await?;
        Ok(count)
    }
    async fn get_stored_msg_secret(
        &self,
        chat: &str,
        sender: &str,
        id: &str,
    ) -> Result<Option<StoredMessageSecret>> {
        // Deserialize the bytes separately to preserve the typed invalid-length error.
        #[derive(Deserialize)]
        struct Secret {
            secret: Vec<u8>,
            #[serde(default)]
            message_ts: i64,
        }
        self.get::<Secret>(key("secret", chat, sender, id))?
            .map(|s| StoredMessageSecret::from_stored_bytes(&s.secret, s.message_ts))
            .transpose()
    }
    async fn delete_expired_msg_secrets(&self, cutoff: i64) -> Result<u32> {
        let mut ops = vec![];
        for row in self.scan("secret", None)? {
            let value: MsgSecretEntry = decode(&row.value)?;
            if value.expires_at != 0 && value.expires_at <= cutoff {
                ops.push(del(key("secret", &row.first, &row.second, &row.third)));
            }
        }
        self.commit(ops).await
    }
}
