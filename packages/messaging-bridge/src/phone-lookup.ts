/** Account-local, bounded lookup cache. Failures are never treated as absent accounts. */
export type PhoneLookup = { status: 'registered'; address: string } | { status: 'not_found' | 'unresolved' | 'unavailable' };

/** Owned by one Durable Object instance; no contact results are shared across accounts. */
export class PhoneLookupCache {
    private entries = new Map<string, { result: PhoneLookup; expires: number }>();
    async resolve(phone: string, lookup: () => Promise<PhoneLookup>): Promise<PhoneLookup> {
        if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error('Use an international phone number');
        const cached = this.entries.get(phone);
        if (cached && cached.expires > Date.now()) return cached.result;
        let result: PhoneLookup;
        try { result = await lookup(); } catch { result = { status: 'unavailable' }; }
        if (this.entries.size >= 256) this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(phone, { result, expires: Date.now() + (result.status === 'registered' ? 600_000 : result.status === 'unavailable' ? 10_000 : 60_000) });
        return result;
    }
}
