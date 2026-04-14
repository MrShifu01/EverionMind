// ─── Core Domain Types ───

// Canonical type vocabulary — AI should output one of these.
// "secret" is reserved for E2E encryption (vault). "other" is the catch-all.
export const CANONICAL_TYPES = [
  "person",
  "note",
  "task",
  "document",
  "recipe",
  "event",
  "health",
  "finance",
  "reminder",
  "contact",
  "place",
  "idea",
  "decision",
  "other",
  "secret",
] as const;

// Entry types are flexible strings — the AI picks the most descriptive label.
// Well-known types with dedicated icons: reminder, document, contact, place,
// person, idea, color, decision, note. "secret" is reserved for E2E encryption.
export type EntryType = string;

export type Priority = "high" | "medium" | "low";

export type Workspace = "business" | "personal" | "both";

export type ConfidenceLevel = "extracted" | "inferred" | "ambiguous";

export interface EntryMetadata {
  phone?: string;
  email?: string;
  url?: string;
  due_date?: string;
  expiry_date?: string;
  event_date?: string;
  day_of_week?: string;
  date?: string;
  price?: string;
  unit?: string;
  workspace?: Workspace;
  confidence?: Record<string, ConfidenceLevel>;
  [key: string]: unknown;
}

export interface Entry {
  id: string;
  title: string;
  content?: string;
  type: EntryType;
  tags?: string[];
  metadata?: EntryMetadata;
  workspace?: Workspace;
  brain_id?: string;
  created_at?: string;
  updated_at?: string;
  encrypted?: boolean;
  pinned?: boolean;
  importance?: number;
}

export interface TypeConfig {
  i: string; // icon emoji
  c: string; // color hex
}

export interface PriorityConfig {
  bg: string;
  c: string;
  l: string;
}

export interface Suggestion {
  q: string;
  cat: string;
  p: Priority;
}

export interface Brain {
  id: string;
  name: string;
  type?: string;
  myRole?: string;
  owner_id?: string;
  created_at?: string;
}

export interface ToastEvent {
  message: string;
  type: "info" | "error" | "success";
  id: number;
}

export type ToastListener = (event: ToastEvent) => void;

export interface Concept {
  id: string;
  label: string;
  source_entries: string[];
  frequency: number;
}

export interface Relationship {
  source_concept: string;
  target_concept: string;
  relation: string;
  confidence: "extracted" | "inferred";
  confidence_score: number;
  evidence_entries: string[];
}

export interface Link {
  from_id: string;
  to_id: string;
  rel: string;
}

export interface OfflineOp {
  id: string;
  url: string;
  method: string;
  body: string;
  created_at: string;
  tempId?: string;
}

export interface RolePermissions {
  canWrite: boolean;
  canInvite: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  role: string;
}
