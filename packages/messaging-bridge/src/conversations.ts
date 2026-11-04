import type { BridgeConversationState } from './types';

/** Latest native folder state with a durable replay position independent of message history. */
export class ConversationJournal {
    constructor(private readonly storage: DurableObjectStorage) {
        storage.sql.exec(`CREATE TABLE IF NOT EXISTS conversation_archive (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL UNIQUE,
            archived INTEGER NOT NULL CHECK (archived IN (0,1))
        )`);
    }

    /** Record an observed native state; repeated snapshots do not generate new events.
     * @param chat Canonical platform peer.
     * @param isArchived Native archive membership.
     * @returns The current durable state and replay position.
     */
    record(chat: string, isArchived: boolean): BridgeConversationState {
        if (!chat || chat.length > 160 || typeof isArchived !== 'boolean') throw new Error('Invalid conversation state');
        this.storage.sql.exec(`INSERT INTO conversation_archive(chat,archived) VALUES (?,?)
            ON CONFLICT(chat) DO UPDATE SET sequence=excluded.sequence, archived=excluded.archived
            WHERE conversation_archive.archived != excluded.archived`, chat, Number(isArchived));
        return this.get(chat)!;
    }

    /** Read one account-owned native state. @param chat Canonical peer. @returns Known state, if any. */
    get(chat: string): BridgeConversationState | undefined {
        const row = this.storage.sql.exec<{ sequence: number; chat: string; archived: number }>('SELECT sequence,chat,archived FROM conversation_archive WHERE chat=?', chat).toArray()[0];
        return row ? { sequence: row.sequence, chat: row.chat, isArchived: Boolean(row.archived) } : undefined;
    }

    /** Replay a bounded page without acknowledging it on behalf of any consumer.
     * @param after Last durably projected archive position.
     * @returns Up to 100 current states, in ascending replay order.
     */
    updates(after = 0): BridgeConversationState[] {
        if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid archive cursor');
        return this.storage.sql.exec<{ sequence: number; chat: string; archived: number }>('SELECT sequence,chat,archived FROM conversation_archive WHERE sequence>? ORDER BY sequence LIMIT 100', after)
            .toArray().map(row => ({ sequence: row.sequence, chat: row.chat, isArchived: Boolean(row.archived) }));
    }
}
