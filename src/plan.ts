// Plan = diff + classification + impact. Pure and deterministic, so it runs without credits (--dry-run).
import { classify } from "./changeTypes.ts";
import { diffSpecs } from "./diff.ts";
import type { MatrixRow, Plan, Spec } from "./types.ts";

export const SPEC_PATH = "spec/protocol.json";

export function buildPlan(baseline: Spec, amendment: Spec, matrix: MatrixRow[]): Plan {
  const changes = diffSpecs(baseline, amendment).map((change) => {
    const type = classify(change);
    const locator = matrix.find((r) => r.reqId === change.reqId)?.locator;
    return {
      change,
      typeId: type.id,
      handling: type.handling(change),
      risk: type.risk(change),
      files: type.files(change),
      locator,
      instructions: type.instructions(change, locator),
    };
  });
  const allowedFiles = [SPEC_PATH, ...new Set(changes.flatMap((c) => c.files))];
  return {
    study: amendment.study.id,
    fromVersion: baseline.study.protocolVersion,
    toVersion: amendment.study.protocolVersion,
    amendment,
    changes,
    allowedFiles,
  };
}

export function formatPlan(plan: Plan): string {
  const lines = [
    `${plan.study}: protocol ${plan.fromVersion} → ${plan.toVersion}, ${plan.changes.length} change(s)`,
    "",
    ...plan.changes.map(
      (p) =>
        `  ${p.change.id}  ${p.change.reqId.padEnd(9)} ${p.typeId.padEnd(23)} ${p.handling.padEnd(28)} risk=${p.risk}\n` +
        `         ${p.change.summary}`,
    ),
    "",
    `  Files the agent may change: ${plan.allowedFiles.join(", ")}`,
  ];
  return lines.join("\n");
}
