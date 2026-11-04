/** A browser renews every 20 seconds; crashed tabs expire without a leave request. */
export const VIEWER_TTL_MS = 75_000;
export const IDLE_GRACE_MS = 30_000;

export interface PresenceStorage {
    list(): { id: string; expires: number }[];
    put(id: string, expires: number): void;
    remove(id: string): void;
}

/** Account-scoped viewer leases; opening a second UI never starts a second session. */
export class ViewerPresence {
    constructor(private readonly storage: PresenceStorage) {}

    renew(id: string, now: number): void {
        if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) throw new Error('Invalid viewer ID');
        this.prune(now);
        this.storage.put(id, now + VIEWER_TTL_MS);
    }

    /** Leaving grants a short reconnect grace period without affecting other viewers. */
    leave(id: string, now: number): void {
        const previous = this.storage.list().find(item => item.id === id);
        if (previous) this.storage.put(id, Math.min(previous.expires, now + IDLE_GRACE_MS));
    }

    prune(now: number): void {
        for (const item of this.storage.list()) if (item.expires <= now) this.storage.remove(item.id);
    }

    nextExpiry(now: number): number | null {
        this.prune(now);
        const rows = this.storage.list();
        return rows.length ? Math.min(...rows.map(row => row.expires)) : null;
    }
}
