// Builds the instructions sent to the Cursor agent. Everything the agent needs is in the prompt
// plus the study repo's AGENTS.md; the agent decides HOW to edit files, never WHAT changed.
import { SPEC_PATH } from "./plan.ts";
import type { Finding, Plan } from "./types.ts";

export const PR_SECTIONS = ["## Amendment", "## Changes implemented", "## Needs human action", "## Open questions", "## Checks"];

export function buildPrompt(plan: Plan): string {
  const todo = plan.changes.filter((p) => p.handling !== "open_question");
  const dont = plan.changes.filter((p) => p.handling === "open_question");

  return `You are implementing a protocol amendment for clinical study ${plan.study} in this repository (a REDCap study build kept as code).
Protocol ${plan.fromVersion} → ${plan.toVersion}.

Read AGENTS.md first and follow it exactly. Its hard rules override anything else.

## Step 1: Update the requirements baseline
Replace ${SPEC_PATH} with exactly this JSON (byte-for-byte content; keep 2-space indentation):

\`\`\`json
${JSON.stringify(plan.amendment, null, 2)}
\`\`\`

## Step 2: Implement these changes
${todo.map((p) => `- [${p.change.id}] ${p.change.reqId}: ${p.change.summary}\n  → ${p.instructions}`).join("\n")}

## Step 3: Do NOT implement these. Report them under "Open questions"
${dont.length ? dont.map((p) => `- [${p.change.id}] ${p.change.reqId}: ${p.change.summary}\n  → ${p.instructions}`).join("\n") : "- (none)"}

## Scope
You may change ONLY these files: ${plan.allowedFiles.join(", ")}.
Never change validator/, tests/, lib/, scripts/, .github/ or trace/locked_instruments.json.

## Step 4: Check and commit
Run \`npm install\` then \`npm run check\`. Fix the build (not the checks) until it passes.
Commit with message: "${plan.study} protocol ${plan.toVersion}: implement amendment".

## Final message
Reply with ONLY the pull request description, using exactly these sections:
${PR_SECTIONS.join("\n")}
Mention the requirement ID (e.g. ${todo[0]?.change.reqId ?? "EX_03"}) for every item in every section.`;
}

export function buildFollowUp(findings: Finding[]): string {
  return `An independent verifier checked your branch and found these problems:

${findings.map((f) => `- ${f.code}${f.reqId ? ` (${f.reqId})` : ""}: ${f.detail}`).join("\n")}

Fix them on the same branch, following AGENTS.md. Do not change validator/, tests/, lib/ or trace/locked_instruments.json.
Run \`npm run check\` until it passes, commit, then reply with ONLY the complete, updated pull request description
using the same sections as before.`;
}
