// Change-type registry: the extension point.
// Each entry decides how one kind of protocol change is handled, which files it may touch,
// and what the agent is told. To support a new kind of amendment, add one entry.
import type { Activity, Change, Criterion, Encounter, Handling, Risk } from "./types.ts";

const DD = "redcap/data_dictionary.csv";
const EVENTS = "redcap/events.csv";
const DESIGNATION = "redcap/instrument_designation.csv";
const MATRIX = "trace/matrix.csv";

export interface ChangeType {
  id: string;
  matches(c: Change): boolean;
  handling(c: Change): Handling;
  risk(c: Change): Risk;
  files(c: Change): string[];
  instructions(c: Change, locator?: string): string;
}

const is = (kind: Change["kind"], op: Change["op"], aspect?: string) => (c: Change) =>
  c.kind === kind && c.op === op && (aspect === undefined || c.aspect === aspect);

export const CHANGE_TYPES: ChangeType[] = [
  {
    id: "encounter-timing",
    matches: is("encounter", "modified", "timing"),
    handling: () => "implement",
    risk: () => "low",
    files: () => [EVENTS],
    instructions: (c, loc) => {
      const a = c.after as Pick<Encounter, "day" | "windowMinus" | "windowPlus">;
      return `In ${EVENTS}, update event \`${loc}\`: day_offset=${a.day}, offset_min=${a.windowMinus}, offset_max=${a.windowPlus}. Change nothing else in that file.`;
    },
  },
  {
    id: "encounter-contact-mode",
    matches: is("encounter", "modified", "contactModes"),
    handling: () => "open_question",
    risk: () => "high",
    files: () => [],
    instructions: (c) =>
      `Do NOT implement. REDCap has no equivalent for visit contact modes, and remote visits affect which assessments can be done ` +
      `(e.g. vital signs need an in-person measurement). List ${c.reqId} under "Open questions": which assessments at this visit ` +
      `may be done remotely, and how remote visits should be recorded.`,
  },
  {
    id: "encounter-added",
    matches: is("encounter", "added"),
    handling: () => "implement",
    risk: () => "medium",
    files: () => [EVENTS, MATRIX],
    instructions: (c) => {
      const e = c.after as Encounter;
      return `Add event "${e.name}" to ${EVENTS} (day_offset=${e.day}, offset_min=${e.windowMinus}, offset_max=${e.windowPlus}, arm 1) and a ${MATRIX} row for ${c.reqId} (kind encounter).`;
    },
  },
  {
    id: "criterion-added",
    matches: is("criterion", "added"),
    handling: () => "implement",
    risk: () => "medium",
    files: () => [DD, MATRIX],
    instructions: (c) => {
      const k = c.after as Criterion;
      return (
        `Add a required yesno field on the eligibility form for ${k.category.toLowerCase()} criterion ${c.reqId} ` +
        `("${k.text}"), phrased as a question, in the ${k.category.toLowerCase()} section, with Field Annotation REQ:${c.reqId}. ` +
        `Add a ${MATRIX} row for ${c.reqId} (kind criterion).`
      );
    },
  },
  {
    id: "criterion-text",
    matches: is("criterion", "modified", "text"),
    handling: () => "implement",
    risk: () => "medium",
    files: () => [DD],
    instructions: (c, loc) => `Update the label of field \`${loc}\` to reflect the new criterion text: "${(c.after as { text: string }).text}".`,
  },
  {
    id: "criterion-removed",
    matches: is("criterion", "removed"),
    handling: () => "open_question",
    risk: () => "high",
    files: () => [],
    instructions: (c) =>
      `Do NOT delete the field: removing a field from a production REDCap project can destroy collected data. ` +
      `List ${c.reqId} under "Open questions" with options (keep and hide, or keep and mark obsolete).`,
  },
  {
    id: "activity-added",
    matches: is("activity", "added"),
    handling: (c) => ((c.after as Activity).licensed ? "implement_with_human_action" : "implement"),
    risk: (c) => ((c.after as Activity).licensed ? "high" : "medium"),
    files: () => [DD, DESIGNATION, MATRIX],
    instructions: (c) => {
      const a = c.after as Activity;
      const where = `Designate it at encounters ${a.encounters.join(", ")} in ${DESIGNATION}, and add a ${MATRIX} row for ${c.reqId} (kind activity).`;
      if (a.licensed) {
        return (
          `Create a new form for licensed instrument ${c.reqId} ("${a.name}") with a <form>_date field and ${a.itemCount ?? "one field per"} item fields ` +
          `labelled exactly [[LICENSED_TEXT_PENDING item N]] (type text, no choices). Never write item wording. ${where} ` +
          `List ${c.reqId} under "Needs human action": item text and response options must come from the licensor.`
        );
      }
      return `Create a new form for activity ${c.reqId} ("${a.name}") with appropriate fields. ${where}`;
    },
  },
  {
    id: "activity-schedule",
    matches: is("activity", "modified", "schedule"),
    handling: () => "implement",
    risk: () => "low",
    files: () => [DESIGNATION],
    instructions: (c, loc) =>
      `Update ${DESIGNATION} so form \`${loc}\` is designated at exactly these encounters: ${(c.after as { encounters: string[] }).encounters.join(", ")}.`,
  },
  {
    // Fallback: anything the registry does not recognize goes to a human, never to a guess.
    id: "unrecognized",
    matches: () => true,
    handling: () => "open_question",
    risk: () => "high",
    files: () => [],
    instructions: (c) => `Do NOT implement. This change type is not supported by the automation. List ${c.reqId} under "Open questions": ${c.summary}.`,
  },
];

export function classify(c: Change): ChangeType {
  return CHANGE_TYPES.find((t) => t.matches(c))!;
}
