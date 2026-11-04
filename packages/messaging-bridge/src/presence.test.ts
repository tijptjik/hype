import { describe, expect, test } from 'bun:test';
import { ViewerPresence, VIEWER_TTL_MS, IDLE_GRACE_MS } from './presence';

function fixture() {
    const rows = new Map<string, number>();
    const presence = new ViewerPresence({
        list: () => [...rows].map(([id, expires]) => ({ id, expires })),
        put: (id, expires) => { rows.set(id, expires); },
        remove: id => { rows.delete(id); },
    });
    return { presence, rows };
}

describe('shared account viewer lifecycle', () => {
    test('one operator leaving cannot stop a second active operator', () => {
        const { presence } = fixture();
        presence.renew('alice:tab1', 0);
        presence.renew('bob:tab1', 10_000);
        presence.leave('alice:tab1', 20_000);
        expect(presence.nextExpiry(20_000)).toBe(20_000 + IDLE_GRACE_MS);
        expect(presence.nextExpiry(50_000)).toBe(10_000 + VIEWER_TTL_MS);
        expect(presence.nextExpiry(85_000)).toBeNull();
    });
    test('crashed tabs expire and reconnect renews the same viewer', () => {
        const { presence, rows } = fixture();
        presence.renew('alice:tab1', 0);
        presence.leave('alice:tab1', 5_000);
        presence.renew('alice:tab1', 10_000);
        expect(rows.size).toBe(1);
        expect(presence.nextExpiry(80_000)).toBe(85_000);
        expect(presence.nextExpiry(85_000)).toBeNull();
    });
    test('unknown leave cannot create a lease or extend expiry', () => {
        const { presence } = fixture();
        presence.leave('unknown', 0);
        expect(presence.nextExpiry(0)).toBeNull();
        presence.renew('alice', 0);
        presence.leave('alice', 70_000);
        expect(presence.nextExpiry(70_000)).toBe(VIEWER_TTL_MS);
    });
});
