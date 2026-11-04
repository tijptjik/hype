// Cloudflare-specific I/O glue for the Rust adapters. Nothing account-specific
// lives at module scope. Every returned operation owns cancellation and cleanup.
const MAX_BODY = 16 * 1024 * 1024;
const ORIGIN = "https://web.whatsapp.com";

export function dial(callback) {
    const abort = new AbortController();
    let socket;
    let closed = false;
    let notify = callback;
    const message = (event) => notify?.(event.data);
    const ended = () => notify?.(null);
    const close = () => {
        closed = true;
        notify = undefined;
        abort.abort();
        if (socket) {
            socket.removeEventListener("message", message);
            socket.removeEventListener("close", ended);
            socket.removeEventListener("error", ended);
            try { socket.close(1000, "session stopped"); } catch { /* already closed */ }
        }
    };
    const ready = (async () => {
        let phase = "websocket-fetch";
        let status = 0;
        try {
            const response = await fetch("https://web.whatsapp.com/ws/chat", {
                headers: { Upgrade: "websocket", Origin: ORIGIN },
                signal: abort.signal,
                // Workers rejects redirect:"error" before making a request.
                // Inspect the response ourselves without following redirects.
                redirect: "manual",
            });
            status = response.status;
            phase = "websocket-upgrade";
            if (response.status !== 101 || !response.webSocket) {
                await response.body?.cancel();
                throw new Error("WhatsApp WebSocket upgrade failed");
            }
            socket = response.webSocket;
            if (closed) { close(); throw new Error("dial cancelled"); }
            phase = "websocket-configure";
            socket.binaryType = "arraybuffer";
            socket.addEventListener("message", message);
            socket.addEventListener("close", ended);
            socket.addEventListener("error", ended);
            phase = "websocket-accept";
            socket.accept();
            phase = "websocket-notify";
            notify?.("connected");
        } catch {
            // Only fixed phase names and HTTP status cross the diagnostic boundary.
            const failure = new Error("WhatsApp transport failed");
            failure.whatsoverPhase = phase;
            failure.whatsoverHttpStatus = status;
            throw failure;
        }
    })();
    return {
        ready,
        send(data) {
            if (closed || !socket) throw new Error("socket is closed");
            socket.send(data);
        },
        close,
    };
}

export function request(metadata, body) {
    const abort = new AbortController();
    const response = (async () => {
        const input = JSON.parse(metadata);
        const url = new URL(input.url);
        if (url.protocol !== "https:") throw new Error("HTTPS required");
        const result = await fetch(url, {
            method: input.method,
            headers: { ...input.headers, Origin: ORIGIN },
            body: body ?? undefined,
            signal: abort.signal,
            redirect: "manual",
        });
        const reader = result.body?.getReader();
        const chunks = [];
        let size = 0;
        if (reader) {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > MAX_BODY) throw new Error("HTTP body exceeds engine limit");
                    chunks.push(value);
                }
            } catch (error) {
                await reader.cancel().catch(() => {});
                throw error;
            } finally { reader.releaseLock(); }
        }
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        return { status: result.status, body: data };
    })();
    return { response, cancel: () => abort.abort() };
}
