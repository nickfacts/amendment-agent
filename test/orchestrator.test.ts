// End-to-end tests of everything except the live Cursor call:
// plan (diff + registry), prompt, trusted checks on a cloned branch, verifier and report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { buildPlan } from "../src/plan.ts";
import { buildFollowUp, buildPrompt } from "../src/prompt.ts";
import { buildReport } from "../src/report.ts";
import { verify } from "../src/verify.ts";
import { Workspace } from "../src/workspace.ts";
import { AMENDMENT, GOOD_PR_BODY, goodImplementation, makeRemote, pushBranch } from "./helpers.ts";

const { remote, work } = makeRemote();
const ws = new Workspace(remote);
const baseline = ws.baseline();
const amendment = JSON.parse(readFileSync(AMENDMENT, "utf8"));
const plan = buildPlan(baseline.spec, amendment, baseline.matrix);

test("plan: finds exactly the 4 amendment changes and classifies them", () => {
  const summary = plan.changes.map((p) => [p.change.reqId, p.typeId, p.handling]);
  assert.deepEqual(summary, [
    ["ENC_W4", "encounter-timing", "implement"],
    ["ENC_W4", "encounter-contact-mode", "open_question"],
    ["EX_03", "criterion-added", "implement"],
    ["ACT_PSQ5", "activity-added", "implement_with_human_action"],
  ]);
  assert.equal(plan.changes[0].locator, "week_4_arm_1", "existing locator comes from trace/matrix.csv");
});

test("plan: allowed files are only what the changes need", () => {
  assert.deepEqual([...plan.allowedFiles].sort(), [
    "redcap/data_dictionary.csv",
    "redcap/events.csv",
    "redcap/instrument_designation.csv",
    "spec/protocol.json",
    "trace/matrix.csv",
  ]);
});

test("prompt: open questions are explicitly not to be implemented", () => {
  const prompt = buildPrompt(plan);
  assert.match(prompt, /Do NOT implement these/);
  assert.match(prompt, /\[CHG-2\] ENC_W4/);
  assert.match(prompt, /LICENSED_TEXT_PENDING/);
});

test("verify: a correct implementation has no findings", () => {
  pushBranch(work, "agent/good", goodImplementation);
  const state = ws.inspectBranch("agent/good");
  assert.equal(state.checks.validateOk, true, state.checks.validateOutput);
  assert.equal(state.checks.failed, 0);
  assert.equal(state.checks.passed, 17);
  const findings = verify(plan, state, GOOD_PR_BODY);
  assert.deepEqual(findings, []);
  const report = buildReport(plan, state, findings, 1);
  assert.match(report, /Ready for human review/);
  writeFileSync(new URL("../out-test-report-good.md", import.meta.url), report);
});

test("verify: catches an agent that cuts corners", () => {
  pushBranch(work, "agent/bad", (p) => {
    goodImplementation(p);
    // 1. forgot the window change
    writeFileSync(p("redcap/events.csv"), readFileSync(p("redcap/events.csv"), "utf8").replace("Week 4,1,42,5,5,", "Week 4,1,42,3,3,"));
    // 2. "improved" the validated Itch NRS wording
    writeFileSync(p("redcap/data_dictionary.csv"), readFileSync(p("redcap/data_dictionary.csv"), "utf8").replace("worst itch imaginable", "worst possible itch"));
    // 3. tried to weaken the tests
    writeFileSync(p("tests/conformance.test.ts"), "// all good\n");
    // 4. touched an unrelated file
    writeFileSync(p("README.md"), "tidied\n");
  });
  const state = ws.inspectBranch("agent/bad");
  const bodyWithoutOpenQuestion = GOOD_PR_BODY.replace(/## Open questions[\s\S]*?## Checks/, "## Open questions\nNone.\n\n## Checks");
  const codes = verify(plan, state, bodyWithoutOpenQuestion).map((f) => `${f.code}${f.reqId ? `:${f.reqId}` : ""}`);

  assert.ok(codes.includes("UNIMPLEMENTED:ENC_W4"), codes.join(", "));
  assert.ok(codes.includes("GUARDRAIL"), "locked instrument edit is a guardrail violation");
  assert.ok(codes.includes("FORBIDDEN_PATH"), "editing tests/ is forbidden");
  assert.ok(codes.includes("OUT_OF_SCOPE"), "README.md is out of scope");
  assert.ok(codes.includes("UNREPORTED:ENC_W4"), "the remote-visit open question was not reported");
  // The weakened test file was ignored: trusted tests from main still ran.
  assert.equal(state.checks.passed + state.checks.failed, 17);

  const followUp = buildFollowUp(verify(plan, state, bodyWithoutOpenQuestion));
  assert.match(followUp, /UNIMPLEMENTED \(ENC_W4\)/);
  writeFileSync(new URL("../out-test-report-bad.md", import.meta.url), buildReport(plan, state, verify(plan, state, bodyWithoutOpenQuestion), 3));
});

test("verify: an agent that edits requirements to match its build is caught", () => {
  pushBranch(work, "agent/cheat", (p) => {
    goodImplementation(p);
    const spec = JSON.parse(readFileSync(p("spec/protocol.json"), "utf8"));
    spec.encounters.find((e: { id: string }) => e.id === "ENC_W4").windowMinus = 3;
    spec.encounters.find((e: { id: string }) => e.id === "ENC_W4").windowPlus = 3;
    writeFileSync(p("spec/protocol.json"), JSON.stringify(spec, null, 2));
    writeFileSync(p("redcap/events.csv"), readFileSync(p("redcap/events.csv"), "utf8").replace("Week 4,1,42,5,5,", "Week 4,1,42,3,3,"));
  });
  const codes = verify(plan, ws.inspectBranch("agent/cheat"), GOOD_PR_BODY).map((f) => f.code);
  assert.deepEqual(codes, ["SPEC_MISMATCH"], "conformance passes, but the spec no longer matches the amendment");
});
