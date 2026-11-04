//! Synthetic contract checks compiled only into the local qualification build.
use super::storage::{Database, DoBackend};
use bytes::Bytes;
use std::sync::Arc;
use wacore::{
    appstate::{hash::HashState, processor::AppStateMutationMAC},
    store::traits::*,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = qualifyStorage)]
pub async fn qualify_storage(database: Database) -> Result<(), JsValue> {
    checks(DoBackend::new(database))
        .await
        .map_err(|e| JsValue::from_str(&format!("storage qualification: {e}")))
}

async fn checks(db: DoBackend) -> anyhow::Result<()> {
    use anyhow::ensure;
    db.create().await?;
    let initial = db.load().await?.unwrap();
    db.save(&initial).await?;
    ensure!(db.load().await?.unwrap().registration_id == initial.registration_id);
    db.put_identity("test:1", [7; 32]).await?;
    ensure!(db.load_identity("test:1").await? == Some([7; 32]));
    db.store_prekey(12, b"synthetic", false).await?;
    ensure!(db.get_max_prekey_id().await? == 12);
    db.mark_prekeys_uploaded(&[12]).await?;
    ensure!(db.load_prekey(12).await?.as_deref() == Some(b"synthetic".as_slice()));

    ensure!(db.get_version("test").await?.is_none());
    db.put_mutation_macs(
        "test",
        1,
        &[AppStateMutationMAC {
            index_mac: vec![1],
            value_mac: vec![2],
        }],
    )
    .await?;
    db.commit_patch(
        "test",
        HashState {
            version: 2,
            ..Default::default()
        },
        &[vec![1]],
        &[AppStateMutationMAC {
            index_mac: vec![1],
            value_mac: vec![3],
        }],
    )
    .await?;
    ensure!(db.get_version("test").await?.unwrap().version == 2);
    ensure!(db.get_mutation_mac("test", &[1]).await? == Some(vec![3]));
    db.clear_mutation_macs("test").await?;
    ensure!(db.get_mutation_mac("test", &[1]).await?.is_none());

    let k = PendingInboundKey {
        chat: "1@g.us",
        sender: "2:3@lid",
        id: "synthetic",
    };
    let lease = PendingInboundLease::new(Arc::new(()));
    let bytes = Bytes::from_static(b"one");
    let replacement = || PendingInboundPayload::new(bytes.clone(), lease.clone());
    ensure!(
        db.replace_pending_inbound_if(k, PendingInboundRevision::missing(), replacement(), 10)
            .await?
            == PendingInboundMutation::Applied
    );
    ensure!(
        db.replace_pending_inbound_if(k, PendingInboundRevision::missing(), replacement(), 10)
            .await?
            == PendingInboundMutation::Applied
    );
    ensure!(
        db.read_pending_inbound_bounded(k, 2, lease.clone())
            .await
            .is_err()
    );
    let alias = PendingInboundKey {
        sender: "2@lid",
        ..k
    };
    let (physical, record) = db
        .read_pending_inbound_group_bounded(alias, 10, lease.clone())
        .await?
        .unwrap();
    ensure!(physical == k.sender && record.bytes() == b"one");
    ensure!(
        db.delete_pending_inbound_if(k, PendingInboundRevision::missing(), 10, lease.clone())
            .await?
            == PendingInboundMutation::Conflict
    );
    ensure!(
        db.delete_pending_inbound_if(k, record.revision(), 10, lease.clone())
            .await?
            == PendingInboundMutation::Applied
    );
    ensure!(
        db.get_pending_inbound(k.chat, k.sender, k.id)
            .await?
            .is_none()
    );
    db.store_pending_inbound(k.chat, "2:3@lid", k.id, b"one")
        .await?;
    db.store_pending_inbound(k.chat, "2:4@lid", k.id, b"two")
        .await?;
    ensure!(
        db.read_pending_inbound_group_bounded(alias, 10, lease)
            .await
            .is_err()
    );

    db.touch_tc_token_sender_timestamp("contact", 20).await?;
    db.store_received_tc_token("contact", &[1], 30).await?;
    db.touch_tc_token_sender_timestamp("contact", 10).await?;
    db.store_received_tc_token("contact", &[2], 25).await?;
    let token = db.get_tc_token("contact").await?.unwrap();
    ensure!(token.token == [1] && token.sender_timestamp == Some(20));
    ensure!(db.delete_expired_tc_tokens(40, 10).await? == 0);
    ensure!(db.delete_expired_tc_tokens(40, 40).await? == 1);

    let entry = MsgSecretEntry {
        chat: "1@lid".into(),
        sender: "2@lid".into(),
        msg_id: "test".into(),
        secret: [5; 32],
        expires_at: 100,
        message_ts: 10,
    };
    db.put_msg_secrets(vec![
        entry.clone(),
        MsgSecretEntry {
            expires_at: 0,
            message_ts: 5,
            ..entry.clone()
        },
    ])
    .await?;
    ensure!(
        db.get_stored_msg_secret("1@lid", "2@lid", "test")
            .await?
            .unwrap()
            .message_ts
            == Some(10)
    );
    ensure!(db.delete_expired_msg_secrets(200).await? == 0);
    db.store_sent_message("1@lid", "id", b"retry").await?;
    ensure!(db.get_sent_message("1@lid", "id").await?.as_deref() == Some(b"retry".as_slice()));
    ensure!(db.take_sent_message("1@lid", "id").await?.as_deref() == Some(b"retry".as_slice()));
    ensure!(db.get_sent_message("1@lid", "id").await?.is_none());
    Ok(())
}

/// Exercise the native archive event consumer with synthetic account data only.
#[wasm_bindgen(js_name = qualifyArchiveEvent)]
pub fn qualify_archive_event(journal: super::JournalHost, chat: &str, archived: bool) -> Result<bool, JsValue> {
    use whatsapp_rust::prelude::{Event, EventHandler};
    use wacore::types::events::ArchiveUpdate;
    let dirty = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let handler = super::WorkerReceipts(send_wrapper::SendWrapper::new(journal), dirty.clone());
    let mut action = waproto::whatsapp::sync_action_value::ArchiveChatAction::default();
    action.archived = Some(archived);
    let update = ArchiveUpdate::builder()
        .jid(chat.parse().map_err(|_| JsValue::from_str("invalid synthetic chat"))?)
        .timestamp(Default::default()).action(Box::new(action)).from_full_sync(false).build();
    handler.handle_event(Arc::new(Event::ArchiveUpdate(update)));
    Ok(dirty.load(std::sync::atomic::Ordering::Relaxed))
}
