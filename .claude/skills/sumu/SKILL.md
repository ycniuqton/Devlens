---
name: sumu
description: Summarize and merge all version docs of a feature into one consolidated version, then remove old sub-versions
---

The user wants to consolidate a feature's documentation history into a single up-to-date version.

## Steps

1. **Identify the feature.** Use the feature name from the prompt. If not provided, list all folders under `/docs/features/` and ask the user to pick one.

2. **Read all version folders** under `/docs/features/<feature-name>/`, sorted numerically ascending. Read every file inside each version.

3. **Synthesize one consolidated doc set** from all versions:
   - `01-requirements.md` — final, current requirements only. No history duplication. Max 100 lines.
   - `02-design.md` — complete current design, absorbing all changes across versions. No line limit.
   - `03-plan.md` — current execution state only (pending/in-progress steps). Max 100 lines.

4. **Determine the new version folder name:**
   - Count existing versions. If total ≤ 4 after consolidation, use next increment (e.g. `00004`).
   - If consolidation produces a clean new baseline, name it `10000-reset` (or `20000-reset` if a reset already exists).

5. **Write the new version folder** with the 3 consolidated files.

6. **Delete all old version folders** for this feature — they are no longer needed. Keep only the new consolidated version.

7. **Report** what was merged, what the new active version is, and confirm old versions were removed.

## Constraints
- Follow all Feature & System Documentation rules from `.devlens/rules.md`
- Never create more than 3 files per version folder
- Requirements and plan must stay ≤ 100 lines after consolidation — summarize if needed
- Do not keep any CURRENT/active marker files
