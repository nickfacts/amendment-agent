## 🤖 Amendment verifier: ABC-101 protocol 1.0 → 2.0

**Result: ⚠️ Needs attention: 5 finding(s) after 3 attempt(s)**

| Change | Requirement | What changed | Type | Risk | Status |
|---|---|---|---|---|---|
| CHG-1 | `ENC_W4` | encounter ENC_W4 timing: windowMinus 3 → 5, windowPlus 3 → 5 | encounter-timing | low | ❌ UNIMPLEMENTED |
| CHG-2 | `ENC_W4` | encounter ENC_W4 contactModes: contactModes ["In person"] → ["In person","Remote (video)"] | encounter-contact-mode | high | ❌ UNREPORTED |
| CHG-3 | `EX_03` | Added criterion EX_03: Prior biologic therapy for psoriasis within 12 weeks before Baseline. | criterion-added | medium | ✅ Implemented |
| CHG-4 | `ACT_PSQ5` | Added activity ACT_PSQ5: PSQ-5 Pruritus Symptom Questionnaire (licensed; item text supplied by licensor, not in protocol) | activity-added | high | ⏳ Scaffolded, needs human |

### Checks
_Trusted validator and conformance tests from `main`, run against this branch's files._
- REDCap structural validation: ❌ fail
- Conformance tests: ❌ 16 passed, 1 failed
- Files changed: `README.md`, `redcap/data_dictionary.csv`, `redcap/instrument_designation.csv`, `spec/protocol.json`, `tests/conformance.test.ts`, `trace/matrix.csv`

### Findings
- **OUT_OF_SCOPE**: changed README.md, which no planned change requires
- **FORBIDDEN_PATH**: changed tests/conformance.test.ts; checks, locks, CI and dependencies are off-limits
- **GUARDRAIL**: locked instrument itch_nrs: content changed (Validated instrument: wording, response options and ranges are fixed. Changes require QA and licensor approval.). Locked instruments must not be edited.
- **UNIMPLEMENTED** `ENC_W4`: ENC_W4 offset_min (window minus) 3 !== 5
- **UNREPORTED** `ENC_W4`: CHG-2 must be listed under "Open questions"

### Reviewer checklist
- [ ] Changes match the amendment's summary of changes
- [ ] `ACT_PSQ5`: licensed item text and response options received from licensor and entered
- [ ] `ENC_W4`: open question resolved with the study team (encounter-contact-mode)
- [ ] QA sign-off for high-risk changes
- [ ] Deploy to a REDCap **Development** copy and test before submitting via Draft Mode

_This PR was prepared by an AI agent. It must not be merged without human approval._