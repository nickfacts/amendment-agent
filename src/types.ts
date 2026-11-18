// Shared types for the amendment orchestrator.

/** Simplified, USDM-inspired protocol spec (same shape as spec/protocol.json in the study build). */
export interface Spec {
  study: { id: string; title: string; phase: string; protocolVersion: string; amendment: unknown };
  encounters: Encounter[];
  eligibilityCriteria: Criterion[];
  activities: Activity[];
}
export interface Encounter {
  id: string;
  name: string;
  day: number;
  windowMinus: number;
  windowPlus: number;
  contactModes: string[];
}
export interface Criterion {
  id: string;
  category: "Inclusion" | "Exclusion";
  text: string;
}
export interface Activity {
  id: string;
  name: string;
  encounters: string[];
  licensed: boolean;
  itemCount?: number;
}

export type Kind = "encounter" | "criterion" | "activity";
export type Op = "added" | "removed" | "modified";

/** One requirement-level change between two protocol versions. Produced by diff.ts, no AI involved. */
export interface Change {
  id: string; // CHG-1, CHG-2, ...
  reqId: string; // ENC_W4, EX_03, ...
  kind: Kind;
  op: Op;
  aspect: string; // timing | contactModes | text | schedule | definition | ... ("item" for added/removed)
  before: unknown;
  after: unknown;
  summary: string;
}

/** What the orchestrator wants done with a change. */
export type Handling =
  | "implement" // the agent implements it
  | "implement_with_human_action" // the agent scaffolds it, a human must finish (e.g. licensed text)
  | "open_question"; // the agent must NOT implement it; it reports it for a human decision

export type Risk = "low" | "medium" | "high";

export interface MatrixRow {
  reqId: string;
  kind: Kind;
  artifact: string;
  locator: string;
  testId: string;
}

/** A change after classification by the change-type registry. */
export interface PlannedChange {
  change: Change;
  typeId: string;
  handling: Handling;
  risk: Risk;
  files: string[]; // files the agent may touch for this change
  locator?: string; // existing REDCap name from trace/matrix.csv, if any
  instructions: string; // what the agent is told to do
}

export interface Plan {
  study: string;
  fromVersion: string;
  toVersion: string;
  amendment: Spec;
  changes: PlannedChange[];
  allowedFiles: string[]; // union of all files the agent may change
}

export type FindingCode =
  | "SPEC_MISMATCH" // spec/protocol.json on the branch is not exactly the amendment
  | "FORBIDDEN_PATH" // touched checks, locks or CI
  | "OUT_OF_SCOPE" // touched a file no planned change needs
  | "INVALID_BUILD" // REDCap structural validation failed
  | "GUARDRAIL" // edited a locked instrument or wrote licensed wording
  | "UNIMPLEMENTED" // a planned change's conformance test fails
  | "REGRESSION" // an unrelated requirement's conformance test now fails
  | "UNTRACED" // a new requirement has no trace/matrix.csv row
  | "UNREPORTED"; // PR description is missing a section, an open question or a human action

export interface Finding {
  code: FindingCode;
  reqId?: string;
  changeId?: string; // set when the finding is about one specific planned change
  detail: string;
}
