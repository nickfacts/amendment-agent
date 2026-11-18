// A local clone of the study-build repo, used to (1) read the baseline from main and
// (2) verify the agent's branch. Verification runs the TRUSTED checks from main against the
// branch's data files, so a branch cannot make itself pass by weakening validator/ or tests/.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMatrix } from "./csv.ts";
import type { MatrixRow, Spec } from "./types.ts";

export interface CheckResults {
  validateOk: boolean;
  validateOutput: string;
  failingTests: { name: string; error: string }[];
  passed: number;
  failed: number;
}

export interface BranchState {
  changedPaths: string[];
  spec: Spec;
  matrix: MatrixRow[];
  checks: CheckResults;
}

const TRUSTED_PATHS = ["validator", "tests", "lib", "scripts", "package.json", "tsconfig.json", "trace/locked_instruments.json"];

export class Workspace {
  readonly dir: string;

  constructor(cloneUrl: string) {
    this.dir = mkdtempSync(join(tmpdir(), "study-build-"));
    git(["clone", "--quiet", cloneUrl, this.dir]);
  }

  /** Read a file as it is on origin/main. */
  readMain(path: string): string {
    return git(["-C", this.dir, "show", `origin/main:${path}`]);
  }

  baseline(): { spec: Spec; matrix: MatrixRow[] } {
    return {
      spec: JSON.parse(this.readMain("spec/protocol.json")),
      matrix: parseMatrix(this.readMain("trace/matrix.csv")),
    };
  }

  /** Check out the agent's branch, restore trusted checks from main, run them, and collect state. */
  inspectBranch(branch: string): BranchState {
    git(["-C", this.dir, "fetch", "--quiet", "origin", `${branch}:refs/remotes/origin/${branch}`]);
    git(["-C", this.dir, "checkout", "--quiet", "--force", "-B", "verify", `origin/${branch}`]);
    const changedPaths = git(["-C", this.dir, "diff", "--name-only", `origin/main...origin/${branch}`])
      .split("\n")
      .filter(Boolean);

    git(["-C", this.dir, "checkout", "origin/main", "--", ...TRUSTED_PATHS]);
    run("npm", ["install", "--silent", "--no-audit", "--no-fund"], this.dir);

    const validate = run("npx", ["tsx", "validator/validate.ts"], this.dir);
    const testFiles = readdirSync(join(this.dir, "tests")).filter((f) => f.endsWith(".test.ts")).map((f) => `tests/${f}`);
    const tests = run("npx", ["tsx", "--test", "--test-reporter=tap", ...testFiles], this.dir);

    return {
      changedPaths,
      spec: JSON.parse(readFileSync(join(this.dir, "spec/protocol.json"), "utf8")),
      matrix: parseMatrix(readFileSync(join(this.dir, "trace/matrix.csv"), "utf8")),
      checks: {
        validateOk: validate.status === 0,
        validateOutput: (validate.stdout + validate.stderr).trim(),
        ...parseTap(tests.stdout),
      },
    };
  }
}

/** Parse node:test TAP output into failing test names and their first error line. */
export function parseTap(tap: string): Pick<CheckResults, "failingTests" | "passed" | "failed"> {
  const failingTests: CheckResults["failingTests"] = [];
  const lines = tap.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^not ok \d+ - (.+)$/);
    if (!m) return;
    const block = lines.slice(i + 1, i + 40);
    const at = block.findIndex((l) => /^\s+error: /.test(l));
    let error = "";
    if (at >= 0) {
      const indent = block[at].search(/\S/);
      const value = block[at].replace(/^\s+error:\s*/, "");
      if (/^[|>]-?$/.test(value)) {
        // YAML block scalar: the message is on the following, more-indented lines.
        const rest: string[] = [];
        for (const l of block.slice(at + 1)) {
          if (l.trim() && l.search(/\S/) <= indent) break;
          if (l.trim()) rest.push(l.trim());
        }
        error = rest.join(" ");
      } else {
        error = value.replace(/^'|'$/g, "");
      }
    }
    failingTests.push({ name: m[1], error: error.slice(0, 240) });
  });
  const count = (k: string) => Number(tap.match(new RegExp(`^# ${k} (\\d+)`, "m"))?.[1] ?? 0);
  return { failingTests, passed: count("pass"), failed: count("fail") };
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function run(cmd: string, args: string[], cwd: string) {
  // Drop NODE_TEST_CONTEXT so the study repo's node:test run reports normally (TAP),
  // even when this code itself runs inside a test runner.
  const { NODE_TEST_CONTEXT: _ignored, ...env } = process.env;
  return spawnSync(cmd, args, { cwd, encoding: "utf8", env });
}
