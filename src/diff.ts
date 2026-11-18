// Deterministic requirement-level diff between two protocol versions.
// The model never decides WHAT changed; this code does.
import { isDeepStrictEqual } from "node:util";
import type { Change, Kind, Spec } from "./types.ts";

/** Fields of each item, grouped into the aspect a change type cares about. */
const ASPECTS: Record<Kind, Record<string, string[]>> = {
  encounter: {
    timing: ["day", "windowMinus", "windowPlus"],
    contactModes: ["contactModes"],
    name: ["name"],
  },
  criterion: {
    text: ["text"],
    category: ["category"],
  },
  activity: {
    schedule: ["encounters"],
    definition: ["name", "licensed", "itemCount"],
  },
};

const COLLECTIONS: { kind: Kind; key: "encounters" | "eligibilityCriteria" | "activities" }[] = [
  { kind: "encounter", key: "encounters" },
  { kind: "criterion", key: "eligibilityCriteria" },
  { kind: "activity", key: "activities" },
];

type Item = { id: string; [k: string]: unknown };

function pick(item: Item, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f, item[f]]));
}

function label(item: Item): string {
  return String(item.name ?? item.text ?? item.id);
}

export function diffSpecs(from: Spec, to: Spec): Change[] {
  const changes: Omit<Change, "id">[] = [];

  for (const { kind, key } of COLLECTIONS) {
    const before = new Map((from[key] as unknown as Item[]).map((i) => [i.id, i]));
    const after = new Map((to[key] as unknown as Item[]).map((i) => [i.id, i]));

    for (const [id, item] of after) {
      const old = before.get(id);
      if (!old) {
        changes.push({ reqId: id, kind, op: "added", aspect: "item", before: null, after: item, summary: `Added ${kind} ${id}: ${label(item)}` });
        continue;
      }
      for (const [aspect, fields] of Object.entries(ASPECTS[kind])) {
        const b = pick(old, fields);
        const a = pick(item, fields);
        if (!isDeepStrictEqual(b, a)) {
          changes.push({ reqId: id, kind, op: "modified", aspect, before: b, after: a, summary: describe(kind, id, aspect, b, a) });
        }
      }
    }
    for (const [id, item] of before) {
      if (!after.has(id)) {
        changes.push({ reqId: id, kind, op: "removed", aspect: "item", before: item, after: null, summary: `Removed ${kind} ${id}: ${label(item)}` });
      }
    }
  }

  return changes.map((c, i) => ({ id: `CHG-${i + 1}`, ...c }));
}

function describe(kind: Kind, id: string, aspect: string, b: Record<string, unknown>, a: Record<string, unknown>): string {
  const parts = Object.keys(a)
    .filter((k) => !isDeepStrictEqual(a[k], b[k]))
    .map((k) => `${k} ${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
  return `${kind} ${id} ${aspect}: ${parts.join(", ")}`;
}
