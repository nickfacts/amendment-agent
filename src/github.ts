// Thin wrappers around the GitHub CLI (gh). Only used in live runs.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tmpFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "amend-")), "body.md");
  writeFileSync(path, content);
  return path;
}

/** Find the PR for a branch, creating it if the agent's auto-PR didn't. Returns the PR URL. */
export function ensurePr(repo: string, branch: string, title: string, body: string): string {
  try {
    return gh(["pr", "view", branch, "--repo", repo, "--json", "url", "--jq", ".url"]);
  } catch {
    return gh(["pr", "create", "--repo", repo, "--head", branch, "--base", "main", "--title", title, "--body-file", tmpFile(body)]);
  }
}

/** Set the PR title and description (we use the agent's final message, in our template). */
export function setPrBody(repo: string, pr: string, title: string, body: string): void {
  gh(["pr", "edit", pr, "--repo", repo, "--title", title, "--body-file", tmpFile(body)]);
}

export function commentOnPr(repo: string, pr: string, body: string): void {
  gh(["pr", "comment", pr, "--repo", repo, "--body-file", tmpFile(body)]);
}

export function getPrBody(repo: string, pr: string): string {
  return gh(["pr", "view", pr, "--repo", repo, "--json", "body", "--jq", ".body"]);
}

export function getPrBranch(repo: string, pr: string): string {
  return gh(["pr", "view", pr, "--repo", repo, "--json", "headRefName", "--jq", ".headRefName"]);
}
