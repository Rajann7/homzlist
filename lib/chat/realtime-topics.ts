/**
 * Chat realtime topic names — shared by the server broadcaster
 * (lib/chat/realtime.ts) and the client subscriber (lib/chat/realtime-client.ts).
 * Plain module (no "server-only") so both bundles can import it.
 */
export const threadTopic = (threadId: string) => `chat:thread:${threadId}`;
export const inboxTopic = (profileId: string) => `chat:inbox:${profileId}`;
