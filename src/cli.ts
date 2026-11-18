// Trigger → output, in one command.
//
//   npm run plan                      # diff + classify + prompt, no agent, no credits
//   npm run amend                     # full run: agent → PR → verify → follow-up → report
//   npm run verify -- --pr 3          # re-verify an existing PR and post the report
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildPlan, formatPlan } from "./plan.ts";
import { buildFollowUp, buildPrompt } from "./prompt.ts";
import { buildReport } from "./report.ts";
import { RETRYABLE, verify } from "./verify.ts";
import { Workspace } from "./workspace.ts";
import type { Finding, Plan } from "./types.ts";

const { values: args } = parseArgs({
  options: {
    repo: { type: "string", default: process.env.STUDY_REPO ?? "nickfacts/abc101-study-build" },
    amendment: { type: "string", default: "fixtures/protocol_v2.json" },
    model: { type: "string", default: process.env.AGENT_MODEL ?? "composer-2.5" },
    "max-followups": { type: "string", default: "2" },
    "dry-run": { type: "boolean", default: false },
    pr: { type: "string" },
    "clone-url": { type: "string" },
    "no-comment": { type: "boolean", default: false },
  },
});

const repo = args.repo!;
const cloneUrl = args["clone-url"] ?? `https://github.com/${repo}.git`;
const maxFollowups = Number(args["max-followups"]);

async function main() {
  // ── 1. Plan (deterministic) ─────────────────────────────────────────────
  console.log(`Cloning ${repo} …`);
  const ws = new Workspace(cloneUrl);
  const baseline = ws.baseline();
  const amendment = JSON.parse(readFileSync(args.amendment!, "utf8"));
  const plan = buildPlan(baseline.spec, amendment, baseline.matrix);
  const prompt = buildPrompt(plan);

  console.log(`\n${formatPlan(plan)}\n`);
  mkdirSync("out", { recursive: true });
  writeFileSync("out/plan.json", JSON.stringify(plan, null, 2));
  writeFileSync("out/prompt.md", prompt);
  console.log("Wrote out/plan.json and out/prompt.md");

  if (args["dry-run"]) return;
  if (plan.changes.length === 0) return console.log("No requirement changes. Nothing to do.");

  const gh = await import("./github.ts");
  const title = `${plan.study} protocol ${plan.toVersion}: implement amendment`;

  // ── Verify-only mode: check an existing PR ─────────────────────────────
  if (args.pr) {
    const branch = gh.getPrBranch(repo, args.pr);
    const state = ws.inspectBranch(branch);
    const findings = verify(plan, state, gh.getPrBody(repo, args.pr));
    return finish(plan, state, findings, 1, args.pr, gh);
  }

  // ── 2. Agent (Cursor SDK) ───────────────────────────────────────────────
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("CURSOR_API_KEY is not set (run with --env-file=.env)");
  const { createStudyAgent, runTurn } = await import("./agent.ts");
  const agent = await createStudyAgent({ apiKey, model: args.model!, repoUrl: `https://github.com/${repo}` });

  try {
    let turn = await runTurn(agent, prompt, "Attempt 1: implement amendment");
    if (turn.status !== "finished" || !turn.branch) throw new Error(`Agent run ended with status "${turn.status}" and no branch`);
    const branch = turn.branch;
    const pr = turn.prUrl ?? gh.ensurePr(repo, branch, title, turn.text);
    gh.setPrBody(repo, pr, title, turn.text);
    console.log(`PR: ${pr}`);

    // ── 3. Verify → follow up → verify ───────────────────────────────────
    let attempts = 1;
    let state = ws.inspectBranch(branch);
    let findings = verify(plan, state, turn.text);
    printFindings(findings, attempts);

    while (findings.some((f) => RETRYABLE.has(f.code)) && attempts <= maxFollowups) {
      attempts++;
      turn = await runTurn(agent, buildFollowUp(findings), `Attempt ${attempts}: fix verifier findings`);
      if (turn.status !== "finished") break;
      if (turn.text.trim()) gh.setPrBody(repo, pr, title, turn.text);
      state = ws.inspectBranch(branch);
      findings = verify(plan, state, turn.text);
      printFindings(findings, attempts);
    }

    // ── 4. Report for the human reviewer ─────────────────────────────────
    finish(plan, state, findings, attempts, pr, gh);
  } finally {
    await agent.close();
  }
}

function finish(plan: Plan, state: ReturnType<Workspace["inspectBranch"]>, findings: Finding[], attempts: number, pr: string, gh: typeof import("./github.ts")) {
  const report = buildReport(plan, state, findings, attempts);
  writeFileSync("out/report.md", report);
  if (!args["no-comment"]) gh.commentOnPr(repo, pr, report);
  console.log(`\n${findings.length ? "⚠️  Needs attention" : "✅ Ready for human review"}: ${pr}`);
  console.log("Wrote out/report.md");
}

function printFindings(findings: Finding[], attempt: number) {
  if (!findings.length) return console.log(`\n✓ Verifier (attempt ${attempt}): no findings`);
  console.log(`\n✗ Verifier (attempt ${attempt}): ${findings.length} finding(s)`);
  for (const f of findings) console.log(`  - ${f.code}${f.reqId ? ` ${f.reqId}` : ""}: ${f.detail}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
