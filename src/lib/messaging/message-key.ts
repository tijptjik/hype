/** Stable media identity survives receipts, edits and replay sequence changes.
 * @param message Provider-owned message identity.
 * @returns Collision-safe account-local cache key.
 */
export function messageMediaKey(message:{chat:string;sender:string;id:string}):string { return JSON.stringify([message.chat,message.sender,message.id]) }
