/**
 * Support DTOs shared by the server service and the client screens.
 *
 * Kept out of service.ts because that file is `server-only`; a client component
 * importing a type from it would pull the service-role client into the bundle.
 */

export interface TicketCategory {
  code: string;
  label: string;
  icon: string;
  extraField: "payment_ref" | "alt_contact" | "report_link" | null;
  extraLabel: string | null;
  extraHint: string | null;
  extraWarning: string | null;
  isGrievance: boolean;
  inPicker: boolean;
  ackHours: number;
  resolveDays: number;
}

export interface TicketSummary {
  id: string;
  number: string;
  subject: string;
  category: string;
  categoryLabel: string;
  status: "open" | "replied" | "closed";
  isGrievance: boolean;
  lastMessage: string | null;
  lastAuthor: "user" | "staff" | "system" | null;
  messageCount: number;
  lastActivityAt: string;
}

export interface TicketMessage {
  id: string;
  authorKind: "user" | "staff" | "system";
  authorName: string;
  body: string;
  attachments: Array<{ url: string }>;
  createdAt: string;
}

export interface TicketThread extends TicketSummary {
  createdAt: string;
  acknowledgedAt: string | null;
  slaDueAt: string | null;
  resolution: string | null;
  closedAt: string | null;
  paymentRef: string | null;
  altContact: string | null;
  reportLink: string | null;
  messages: TicketMessage[];
}
