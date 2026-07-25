/**
 * Chat-only inline glyphs (Lucide-style outline, 1.5px round) the shared Icon
 * set doesn't carry yet — envelope, lightning (quick replies), folder/list
 * grouping toggle, calendar, bell-off (mute), archive box, reply arrow, smile
 * (react), block. Colour inherits currentColor; size via `s`.
 */
export function Glyph({ name, s = 20, className }: { name: GlyphName; s?: number; className?: string }) {
  const p = PATHS[name];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {p}
    </svg>
  );
}

export type GlyphName =
  | "envelope" | "envelope-open" | "bolt" | "folder" | "list" | "calendar"
  | "bell-off" | "archive" | "reply" | "smile" | "block" | "megaphone"
  | "handshake" | "paper-plane" | "inbox" | "chat-bubbles" | "flag" | "unlink";

const PATHS: Record<GlyphName, React.ReactNode> = {
  envelope: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  "envelope-open": <><path d="m3 9 9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="m3 9 9 6 9-6" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  "bell-off": <><path d="M8.7 3A6 6 0 0 1 18 8c0 3 .5 4.5 1.5 6M17 17H4c1.5-2 2-3.5 2-9M10.3 21a2 2 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>,
  reply: <path d="M9 17H7A4 4 0 0 1 3 13V9m0 0 4-4M3 9l4 4M7 5h8a6 6 0 0 1 6 6v3" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  block: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  megaphone: <path d="m3 11 15-6v14l-6-2.4M3 11v4a1 1 0 0 0 1 1h3l1 5h3l-1-5m-7-6 9 3.6M7 16v-4" />,
  handshake: <path d="m11 17 2 2a2 2 0 0 0 3-3M8 14l2 2a2 2 0 0 0 3-3l-3-3-2 1a3 3 0 0 1-4-4l4-3 6 1 4 3M3 10l3-3" />,
  "paper-plane": <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></>,
  "chat-bubbles": <><path d="M8 10h.01M12 10h.01M16 10h.01" /><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A8.4 8.4 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" /></>,
  flag: <path d="M4 22V4a1 1 0 0 1 1-1h13l-3 5 3 5H5" />,
  unlink: <path d="M9 17H7A5 5 0 0 1 7 7h2m6 0h2a5 5 0 0 1 4 8M8 12h8M2 2l20 20" />,
};
