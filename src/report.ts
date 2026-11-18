// The verifier's PR comment: what a human reviewer reads before approving.
import type { Finding, Plan } from "./types.ts";
import type { BranchState } from "./workspace.ts";

const HANDLING_STATUS = {
  implement: "Implemented",
  implement_with_human_action: "Scaffolded, needs human",
  open_question: "Not implemented, open question",
} as const;

export function buildReport(plan: Plan, branch: BranchState, findings: Finding[], attempts: number): string {
  const ready = findings.length === 0;
  // A finding belongs to a row if it names that change, or names its requirement and the change was meant to be built.
  const problemsFor = (p: Plan["changes"][number]) =>
    findings.filter((f) => (f.changeId ? f.changeId === p.change.id : f.reqId === p.change.reqId && p.handling !== "open_question"));

  const rows = plan.changes.map((p) => {
    const problems = problemsFor(p);
    const status = problems.length ? `❌ ${problems.map((f) => f.code).join(", ")}` : `${icon(p.handling)} ${HANDLING_STATUS[p.handling]}`;
    return `| ${p.change.id} | \`${p.change.reqId}\` | ${p.change.summary.replace(/\|/g, "\\|")} | ${p.typeId} | ${p.risk} | ${status} |`;
  });

  const checklist = [
    "- [ ] Changes match the amendment's summary of changes",
    ...plan.changes
      .filter((p) => p.handling === "implement_with_human_action")
      .map((p) => `- [ ] \`${p.change.reqId}\`: licensed item text and response options received from licensor and entered`),
    ...plan.changes
      .filter((p) => p.handling === "open_question")
      .map((p) => `- [ ] \`${p.change.reqId}\`: open question resolved with the study team (${p.typeId})`),
    ...(plan.changes.some((p) => p.risk === "high") ? ["- [ ] QA sign-off for high-risk changes"] : []),
    "- [ ] Deploy to a REDCap **Development** copy and test before submitting via Draft Mode",
  ];

  return [
    `## 🤖 Amendment verifier: ${plan.study} protocol ${plan.fromVersion} → ${plan.toVersion}`,
    "",
    ready
      ? `**Result: ✅ Ready for human review** (attempts: ${attempts})`
      : `**Result: ⚠️ Needs attention: ${findings.length} finding(s) after ${attempts} attempt(s)**`,
    "",
    "| Change | Requirement | What changed | Type | Risk | Status |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "### Checks",
    "_Trusted validator and conformance tests from `main`, run against this branch's files._",
    `- REDCap structural validation: ${branch.checks.validateOk ? "✅ pass" : "❌ fail"}`,
    `- Conformance tests: ${branch.checks.failed === 0 ? "✅" : "❌"} ${branch.checks.passed} passed, ${branch.checks.failed} failed`,
    `- Files changed: ${branch.changedPaths.map((p) => `\`${p}\``).join(", ") || "none"}`,
    ...(findings.length
      ? ["", "### Findings", ...findings.map((f) => `- **${f.code}**${f.reqId ? ` \`${f.reqId}\`` : ""}: ${f.detail}`)]
      : []),
    "",
    "### Reviewer checklist",
    ...checklist,
    "",
    "_This PR was prepared by an AI agent. It must not be merged without human approval._",
  ].join("\n");
}

function icon(h: keyof typeof HANDLING_STATUS): string {
  return h === "implement" ? "✅" : h === "implement_with_human_action" ? "⏳" : "❓";
}
