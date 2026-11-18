// Independent verifier: the agent does not grade its own work.
// Pure function over the branch state, so it is fully testable without the SDK.
import { isDeepStrictEqual } from "node:util";
import { PR_SECTIONS } from "./prompt.ts";
import type { Finding, Plan } from "./types.ts";
import type { BranchState } from "./workspace.ts";

const FORBIDDEN = /^(validator|tests|lib|scripts|\.github)\/|^trace\/locked_instruments\.json$|^package(-lock)?\.json$/;

/** Codes worth sending back to the agent for another attempt. */
export const RETRYABLE = new Set(["SPEC_MISMATCH", "FORBIDDEN_PATH", "OUT_OF_SCOPE", "INVALID_BUILD", "GUARDRAIL", "UNIMPLEMENTED", "REGRESSION", "UNTRACED", "UNREPORTED"]);

export function verify(plan: Plan, branch: BranchState, prBody: string): Finding[] {
  const findings: Finding[] = [];
  const add = (code: Finding["code"], detail: string, reqId?: string, changeId?: string) =>
    findings.push({ code, detail, reqId, ...(changeId ? { changeId } : {}) });
  const planned = new Map(plan.changes.map((p) => [p.change.reqId, p]));

  // 1. The requirements baseline must be exactly the amendment. Otherwise the agent could
  //    "pass" by editing requirements to match its build.
  if (!isDeepStrictEqual(branch.spec, plan.amendment)) {
    add("SPEC_MISMATCH", "spec/protocol.json on the branch is not exactly the amendment spec");
  }

  // 2. Scope.
  for (const path of branch.changedPaths) {
    if (FORBIDDEN.test(path)) add("FORBIDDEN_PATH", `changed ${path}; checks, locks, CI and dependencies are off-limits`);
    else if (!plan.allowedFiles.includes(path)) add("OUT_OF_SCOPE", `changed ${path}, which no planned change requires`);
  }

  // 3. Trusted checks (from main) run against the branch.
  if (!branch.checks.validateOk) {
    const errors = branch.checks.validateOutput.split("\n").filter((l) => l.trim().startsWith("-"));
    for (const e of errors.length ? errors : [branch.checks.validateOutput]) {
      const isLock = /locked instrument/i.test(e);
      add(isLock ? "GUARDRAIL" : "INVALID_BUILD", e.replace(/^\s*-\s*/, ""));
    }
  }
  for (const t of branch.checks.failingTests) {
    const reqId = t.name.match(/^conformance\/([A-Z0-9_]+)/)?.[1];
    if (/licensed text/i.test(t.error)) add("GUARDRAIL", t.error, reqId);
    else if (reqId && planned.has(reqId)) add("UNIMPLEMENTED", t.error || t.name, reqId);
    else add("REGRESSION", `${t.name}${t.error ? `: ${t.error}` : ""}`, reqId);
  }

  // 4. Traceability: every newly added requirement needs a matrix row.
  for (const p of plan.changes) {
    if (p.change.op === "added" && p.handling !== "open_question" && !branch.matrix.some((r) => r.reqId === p.change.reqId)) {
      add("UNTRACED", `no trace/matrix.csv row for new requirement`, p.change.reqId, p.change.id);
    }
  }

  // 5. Reporting: the PR description must surface what the agent could not or must not do.
  for (const s of PR_SECTIONS) {
    if (!prBody.includes(s)) add("UNREPORTED", `PR description is missing section "${s}"`);
  }
  for (const p of plan.changes) {
    if (p.handling === "open_question" && !sectionMentions(prBody, "## Open questions", p.change.reqId)) {
      add("UNREPORTED", `${p.change.id} must be listed under "Open questions"`, p.change.reqId, p.change.id);
    }
    if (p.handling === "implement_with_human_action" && !sectionMentions(prBody, "## Needs human action", p.change.reqId)) {
      add("UNREPORTED", `${p.change.id} must be listed under "Needs human action"`, p.change.reqId, p.change.id);
    }
  }

  return findings;
}

function sectionMentions(body: string, heading: string, reqId: string): boolean {
  const start = body.indexOf(heading);
  if (start < 0) return false;
  const rest = body.slice(start + heading.length);
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).includes(reqId);
}
