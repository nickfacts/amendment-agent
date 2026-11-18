# amendment-agent

Turns a clinical protocol amendment into a verified, human-reviewable pull request against a REDCap study build
([abc101-study-build](https://github.com/nickfacts/abc101-study-build)), using the Cursor SDK.

**Problem.** A protocol is the requirements spec for a trial's software (EDC/eCOA). Amendments are frequent and every
one forces changes to deployed study builds under GxP change control: impact analysis, implementation, testing,
traceability, approval. This automates the middle of that loop and leaves decisions to people.

## Trigger → output

```
fixtures/protocol_v2.json ──► diff.ts ──► changeTypes.ts ──► plan.ts ──► prompt.ts
  (amended spec)              what changed  how to handle it   scope        instructions
                                                                              │
                                                                              ▼
 PR comment ◄── report.ts ◄── verify.ts ◄── workspace.ts ◄── agent.ts ★ Cursor SDK cloud agent
 (reviewer       findings      independent   clone branch,      clones repo, edits, runs checks,
  checklist)     per change    verifier      run TRUSTED checks  commits, opens PR
                                  │
                                  └── findings? ──► follow-up turn to the SAME agent (max 2) ──┘
```

## Commands

```bash
npm run plan                 # diff + classify + prompt only. No agent, no credits. Writes out/plan.json, out/prompt.md
npm run amend                # full run: agent → PR → verify → follow-ups → report comment
npm run verify -- --pr 3     # re-verify an existing PR and post the report
npm test                     # tests for everything except the live SDK call
```

Options: `--repo owner/name`, `--amendment path`, `--model id` (default `composer-2.5`), `--max-followups n`.

## Design decisions

- **Deterministic diff, AI implementation.** `diff.ts` decides *what* changed; the model only decides *how* to edit files.
- **Change-type registry** (`changeTypes.ts`) is the extension point. Each type sets handling, risk, allowed files and
  agent instructions. Unknown changes fall through to `unrecognized` → open question, never a guess.
- **Three handlings.** `implement`, `implement_with_human_action` (e.g. licensed instrument: scaffold with placeholders,
  licensor supplies text), `open_question` (e.g. remote visits have no REDCap equivalent; the agent must not invent one).
- **The agent doesn't grade itself.** `verify.ts` runs outside the agent, on a fresh clone.
- **Trusted checks.** The verifier restores `validator/`, `tests/`, `lib/` and locks from `main` before running them,
  so a branch cannot pass by weakening its own checks.
- **Spec pinning.** The branch's `spec/protocol.json` must equal the amendment exactly; otherwise the agent could make
  tests pass by editing requirements (`SPEC_MISMATCH`).
- **PRs, never merges.** Branch protection + human approval, mirroring REDCap Draft Mode review for production projects.

## Verifier findings

| Code | Meaning |
|---|---|
| `SPEC_MISMATCH` | Branch spec is not exactly the amendment |
| `FORBIDDEN_PATH` | Touched checks, locks, CI or dependencies |
| `OUT_OF_SCOPE` | Touched a file no planned change needs |
| `INVALID_BUILD` | REDCap structural validation failed |
| `GUARDRAIL` | Edited a locked instrument or wrote licensed wording |
| `UNIMPLEMENTED` | A planned change's conformance test fails |
| `REGRESSION` | An unrelated requirement now fails |
| `UNTRACED` | New requirement has no trace matrix row |
| `UNREPORTED` | PR description misses a section, open question or human action |

## Before a real team used it

Part 11 audit trail of agent runs and approvals; pinned model versions (a model change is a validation event);
SSO and secrets management; deploy step to a REDCap Development project via API; vendor formats (CDISC ODM, Rave ALS)
behind the same registry; PDF → spec extraction upstream with its own eval.

## Quickstart

Prerequisites: Node 22.13+, GitHub CLI (`gh auth login`), a Cursor API key with prepaid credit,
and Cursor's GitHub app given access to the study-build repo.

```bash
git clone https://github.com/nickfacts/abc101-study-build
git clone https://github.com/nickfacts/amendment-agent
cd amendment-agent && npm install
cp .env.example .env        # add your CURSOR_API_KEY
npm test                    # 6 tests: plan, prompt, verifier vs good / corner-cutting / cheating branches
npm run plan                # free: shows the 4 changes and writes out/prompt.md
npm run amend               # live: Cursor cloud agent → PR → verifier → report comment
```

## Status

Prototype. Planner, verifier and report are covered by tests that use real git clones and the study repo's checks.
The live Cursor SDK run (`npm run amend`) is the next milestone. A link to the resulting PR will be added here.
All study content is synthetic.
