// Test harness: a local git "remote" built from the study-build repo, with simulated agent branches.
// Lets the verifier run for real (clone, trusted checks, TAP parsing) without the SDK or GitHub.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const STUDY_BUILD = resolve(process.env.STUDY_BUILD_DIR ?? join(import.meta.dirname, "../../abc101-study-build"));
export const AMENDMENT = resolve(join(import.meta.dirname, "../fixtures/protocol_v2.json"));

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export function makeRemote(): { remote: string; work: string } {
  const root = mkdtempSync(join(tmpdir(), "remote-"));
  const remote = join(root, "origin.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "--quiet", "--bare", "-b", "main", remote]);
  cpSync(STUDY_BUILD, work, { recursive: true, filter: (src) => !/node_modules|\.git$|\.git\//.test(src) });
  git(work, "init", "--quiet", "-b", "main");
  git(work, "-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  git(work, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", "baseline");
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "--quiet", "origin", "main");
  return { remote, work };
}

/** Create a branch from main, apply edits, push it. */
export function pushBranch(work: string, name: string, edit: (path: (p: string) => string) => void) {
  git(work, "checkout", "--quiet", "-B", name, "main");
  edit((p) => join(work, p));
  git(work, "-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git(work, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", name);
  git(work, "push", "--quiet", "--force", "origin", name);
  git(work, "checkout", "--quiet", "main");
}

const replaceIn = (file: string, from: string | RegExp, to: string) => writeFileSync(file, readFileSync(file, "utf8").replace(from, to));

/** What a correct agent would do for Amendment 1. */
export function goodImplementation(p: (x: string) => string) {
  cpSync(AMENDMENT, p("spec/protocol.json"));
  replaceIn(p("redcap/events.csv"), "Week 4,1,42,3,3,", "Week 4,1,42,5,5,");
  replaceIn(
    p("redcap/data_dictionary.csv"),
    /(excl_infection,[^\n]*\n)/,
    `$1excl_prior_biologic,eligibility,,yesno,"Prior biologic therapy for psoriasis within 12 weeks before Baseline?",,,,,,,,y,,,,,REQ:EX_03\n`,
  );
  appendFileSync(
    p("redcap/data_dictionary.csv"),
    `psq5_date,psq5,,text,"Date of completion",,,date_ymd,,,,,y,,,,,\n` +
      [1, 2, 3, 4, 5].map((n) => `psq5_item${n},psq5,,text,"[[LICENSED_TEXT_PENDING item ${n}]]",,,,,,,,,,,,,\n`).join(""),
  );
  appendFileSync(p("redcap/instrument_designation.csv"), "1,baseline_arm_1,psq5\n1,week_12_arm_1,psq5\n");
  appendFileSync(
    p("trace/matrix.csv"),
    "EX_03,criterion,redcap/data_dictionary.csv,excl_prior_biologic,conformance/EX_03\n" +
      "ACT_PSQ5,activity,redcap/instrument_designation.csv,psq5,conformance/ACT_PSQ5\n",
  );
}

export const GOOD_PR_BODY = `## Amendment
ABC-101 protocol 2.0 (Amendment 1)

## Changes implemented
| Requirement | Change | Files |
|---|---|---|
| ENC_W4 | Week 4 window ±5 | redcap/events.csv |
| EX_03 | New exclusion field excl_prior_biologic | redcap/data_dictionary.csv, trace/matrix.csv |
| ACT_PSQ5 | New form psq5 with placeholders | redcap/data_dictionary.csv, redcap/instrument_designation.csv, trace/matrix.csv |

## Needs human action
- ACT_PSQ5: item text and response options must come from the licensor.

## Open questions
- ENC_W4: protocol allows remote Week 4 visits. Which assessments (vital signs?) can be remote, and how should remote visits be recorded?

## Checks
npm run check: validation passed, 17 conformance tests passed.
`;
